import "dotenv/config";
import { Shippo } from "shippo";
import { normalizePhoneForCarrier } from "@/lib/phone";

export const shippo = new Shippo({
    apiKeyHeader: process.env.SHIPPO_API_KEY || "shippo_test_xxx"
});

export const STANDARD_PARCEL = {
    length: "12",
    width: "10",
    height: "4",
    distanceUnit: "in" as const,
    weight: "16", // 1 lb = 16 oz
    massUnit: "oz" as const
};

const US_STATE_MAP: Record<string, string> = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO", "connecticut": "CT",
    "delaware": "DE", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN",
    "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD", "massachusetts": "MA",
    "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
};

function sanitizeAddress(addr: any, name: string, email?: string, phone?: string) {
    const trimmedState = (addr.state || "").trim();
    const mappedState = US_STATE_MAP[trimmedState.toLowerCase()] || trimmedState;

    return {
        name: name.trim(),
        street1: (addr.line1 || addr.street1 || "").trim(),
        street2: (addr.line2 || addr.street2 || "").trim(),
        city: (addr.city || "").trim(),
        state: mappedState.length === 2 ? mappedState.toUpperCase() : trimmedState.toUpperCase(),
        zip: (addr.postal_code || addr.zip || "").trim(),
        country: (addr.country || "US").trim().toUpperCase(),
        phone: normalizePhoneForCarrier((phone || addr.phone || "").trim()),
        email: (email || addr.email || "").trim()
    };
}

export async function getShipmentRates({
    buyerAddress,
    buyerName,
    buyerEmail,
    buyerPhone,
    sellerAddress,
    sellerName,
    sellerEmail,
    sellerPhone
}: {
    buyerAddress: any;
    buyerName: string;
    buyerEmail?: string;
    buyerPhone?: string;
    sellerAddress: any;
    sellerName: string;
    sellerEmail?: string;
    sellerPhone?: string;
}) {
    const addressTo = sanitizeAddress(buyerAddress, buyerName, buyerEmail, buyerPhone);
    const addressFrom = sanitizeAddress(sellerAddress, sellerName, sellerEmail, sellerPhone);

    const shipment = await shippo.shipments.create({
        addressFrom,
        addressTo,
        parcels: [STANDARD_PARCEL],
        async: false
    });

    if (shipment.status === "ERROR" || !shipment.rates || shipment.rates.length === 0) {
        const errorMsg = (shipment as any).messages?.[0]?.text || "No shipping rates available for this address.";
        if (errorMsg.toLowerCase().includes("address")) {
            throw new Error(`Address Validation Error: ${errorMsg}`);
        }
        throw new Error(errorMsg);
    }

    return {
        shipmentId: shipment.objectId,
        rates: (shipment.rates as any[]).map(r => ({
            id: r.objectId,
            carrier: r.provider,
            serviceLevel: r.servicelevel.name,
            amount: r.amount,
            currency: r.currency,
            estimatedDays: r.estimatedDays,
            durationTerms: r.durationTerms
        })).sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))
    };
}

export async function purchaseLabel(rateId: string) {
    const transaction = await shippo.transactions.create({
        rate: rateId,
        labelFileType: "PDF",
        async: false
    });

    if (transaction.status !== "SUCCESS") {
        const errorMessage = (transaction as any).messages?.[0]?.text || "Shippo transaction failed to generate label.";
        throw new Error(errorMessage);
    }

    return {
        shippo_transaction_id: transaction.objectId,
        tracking_number: transaction.trackingNumber,
        label_url: transaction.labelUrl,
    };
}

export async function getShipmentRateById(shipmentId: string, rateId: string) {
    const shipment = await shippo.shipments.get(shipmentId);
    const rates = (shipment as any).rates as any[] | undefined;
    if (!rates || rates.length === 0) return null;

    const matched = rates.find((r) => r.objectId === rateId);
    if (!matched) return null;

    return {
        id: matched.objectId as string,
        carrier: matched.provider as string,
        serviceLevel: matched.servicelevel?.name as string,
        amount: matched.amount as string,
        currency: matched.currency as string,
        estimatedDays: matched.estimatedDays as number | undefined,
    };
}

export async function createStandardLabel(params: any) {
    const { rates } = await getShipmentRates(params);

    // Original logic: Prefer USPS, otherwise cheapest
    const uspsRates = rates.filter(r => r.carrier === "USPS");
    const cheapestRate = uspsRates.length > 0 ? uspsRates[0] : rates[0];

    if (!cheapestRate) {
        throw new Error("No rates available for this shipment.");
    }

    const labelData = await purchaseLabel(cheapestRate.id);
    return {
        ...labelData,
        carrier: cheapestRate.carrier
    };
}
