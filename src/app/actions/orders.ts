"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { serializePurchase } from "@/lib/serialization";
import { getShipmentRates, getShipmentRateById, purchaseLabel } from "@/lib/shippo";
import { normalizeUsPhoneInput } from "@/lib/phone";
import { hasCarrierPhoneLength } from "@/lib/phone";
import { revalidatePath } from "next/cache";

function normalizeShippingAddress(address: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone: string;
}) {
    return {
        ...address,
        name: (address.name || "").trim(),
        line1: (address.line1 || "").trim(),
        line2: (address.line2 || "").trim(),
        city: (address.city || "").trim(),
        state: (address.state || "").trim(),
        postal_code: (address.postal_code || "").trim(),
        country: ((address.country || "US").trim() || "US").toUpperCase(),
        phone: normalizeUsPhoneInput(address.phone || ""),
    };
}

function assertShippingAddressIsComplete(address: {
    name: string;
    line1: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone: string;
}) {
    if (!address.name) throw new Error("Recipient full name is required.");
    if (!address.line1) throw new Error("Address line 1 is required.");
    if (!address.city) throw new Error("City is required.");
    if (!address.state) throw new Error("State is required.");
    if (!address.postal_code) throw new Error("Postal code is required.");
    if (!address.country) throw new Error("Country is required.");
    if (!address.phone) throw new Error("Phone number is required.");
    if (!hasCarrierPhoneLength(address.phone)) throw new Error("Phone number must contain between 8 and 15 digits.");
}

function getSellerOriginOrThrow(seller: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    street1?: string | null;
    street2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
}) {
    const sellerPhone = normalizeUsPhoneInput(seller.phone || "");
    if (!hasCarrierPhoneLength(sellerPhone)) {
        throw new Error("Seller shipping profile is incomplete. Seller must add a valid phone number before shipping can continue.");
    }
    if (!(seller.street1 && seller.city && seller.state && seller.zip)) {
        throw new Error("Seller shipping profile is incomplete. Seller must add a full address before shipping can continue.");
    }

    return {
        sellerAddress: {
            line1: seller.street1,
            line2: seller.street2 || "",
            city: seller.city,
            state: seller.state,
            postal_code: seller.zip,
            country: seller.country || "US"
        },
        sellerName: `${seller.first_name || ""} ${seller.last_name || ""}`.trim() || "Seller",
        sellerEmail: (seller.email || "").trim(),
        sellerPhone
    };
}

export async function completeOrderWithAddress(orderId: string, address: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone: string;
}) {
    try {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Unauthorized");

        const order = await (prisma as any).order.findUnique({
            where: { id: orderId },
            include: {
                purchase: {
                    include: {
                        listing: {
                            include: {
                                user: true
                            }
                        }
                    }
                }
            }
        });

        if (!order) throw new Error("Order not found");

        if (order.tracking_number) {
            return { success: true };
        }

        const buyerId = order.purchase.buyer_id;
        if (session.user.id !== buyerId) {
            throw new Error("Only the buyer can provide shipping details for this order.");
        }

        const normalizedAddress = normalizeShippingAddress(address);
        assertShippingAddressIsComplete(normalizedAddress);

        // Validate destination address up-front while buyer is entering it.
        // This prevents seller-side label failures for obviously invalid recipient addresses.
        const seller = order.purchase.listing.user;
        const sellerOrigin = getSellerOriginOrThrow(seller);

        await getShipmentRates({
            buyerAddress: normalizedAddress,
            buyerName: normalizedAddress.name,
            buyerPhone: normalizedAddress.phone,
            sellerAddress: sellerOrigin.sellerAddress,
            sellerName: sellerOrigin.sellerName,
            sellerEmail: sellerOrigin.sellerEmail,
            sellerPhone: sellerOrigin.sellerPhone
        });

        // 1. Update buyer's phone if they didn't have one (fallback collection)
        await prisma.user.updateMany({
            where: { id: buyerId, phone: null },
            data: { phone: normalizedAddress.phone }
        });

        await (prisma as any).order.update({
            where: { id: orderId },
            data: {
                shipping_address: normalizedAddress as any,
                shipping_status: "NOT_SHIPPED",
                shipping_stage: "ADDRESS_SET",
                shipping_option_rate_id: null,
                shipping_option_carrier: null,
                shipping_option_service: null,
                shipping_option_amount: null,
                shipping_option_currency: null,
                shipping_option_selected_at: null
            }
        });

        revalidatePath("/buy/success");
        revalidatePath("/dashboard/purchases");
        revalidatePath("/dashboard/sales");
        return { success: true };
    } catch (error: any) {
        console.error("completeOrderWithAddress error:", error);
        return { error: error.message || "Failed to update order address." };
    }
}

/**
 * Get all sales for a seller
 */
export async function getSellerSales(sellerId: string) {
    if (!sellerId) return { error: "Seller ID is required." };

    try {
        const sales = await (prisma as any).purchase.findMany({
            where: {
                listing: {
                    user_id: sellerId
                }
            },
            include: {
                order: true,
                listing: {
                    include: {
                        images: {
                            orderBy: { imageOrder: "asc" },
                            take: 1
                        }
                    }
                },
                buyer: {
                    select: {
                        first_name: true,
                        last_name: true,
                        email: true
                    }
                }
            },
            orderBy: { created_at: "desc" }
        });

        return {
            success: true,
            sales: (sales as any[]).map(s => serializePurchase(s))
        };
    } catch (error) {
        console.error("getSellerSales error:", error);
        return { error: "Failed to fetch sales." };
    }
}

export async function getShippingRatesForOrder(orderId: string, address?: any) {
    try {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Unauthorized");

        const order = await (prisma as any).order.findUnique({
            where: { id: orderId },
            include: { purchase: { include: { listing: { include: { user: true } } } } }
        });

        if (!order) throw new Error("Order not found");

        // Auth Check: User must be buyer OR seller
        const isBuyer = order.purchase.buyer_id === session.user.id;
        const isSeller = order.purchase.listing.user_id === session.user.id;
        if (!isBuyer && !isSeller) throw new Error("Unauthorized access to order.");

        const listing = order.purchase.listing;
        const seller = listing.user;

        // Buyer may preview rates with a newly entered address.
        // Seller must always use the buyer address already saved on the order.
        const rawShippingAddress = isBuyer ? (address || order.shipping_address) : order.shipping_address;
        const shippingAddress = rawShippingAddress ? normalizeShippingAddress(rawShippingAddress) : null;
        if (!shippingAddress) {
            throw new Error("Buyer shipping address is missing. Buyer must complete shipping details before label generation.");
        }
        assertShippingAddressIsComplete(shippingAddress);

        const sellerOrigin = getSellerOriginOrThrow(seller);

        const ratesData = await getShipmentRates({
            buyerAddress: shippingAddress,
            buyerName: shippingAddress.name || "Buyer",
            buyerPhone: shippingAddress.phone,
            sellerAddress: sellerOrigin.sellerAddress,
            sellerName: sellerOrigin.sellerName,
            sellerEmail: sellerOrigin.sellerEmail,
            sellerPhone: sellerOrigin.sellerPhone
        });

        return { success: true, ...ratesData };
    } catch (error: any) {
        console.error("getShippingRatesForOrder error:", error);
        return { error: error.message || "Failed to fetch shipping rates." };
    }
}

export async function selectShippingRate(
    orderId: string,
    rateId: string,
    carrier: string,
    shipmentId?: string,
    selectedRateMeta?: {
        serviceLevel?: string;
        amount?: string;
        currency?: string;
        estimatedDays?: number;
    }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Unauthorized");

        const order = await (prisma as any).order.findUnique({
            where: { id: orderId },
            include: { purchase: { include: { listing: true } } }
        });

        if (!order) throw new Error("Order not found");

        // Auth Check: Buyer selects shipping option. Seller only prints from buyer's selection.
        const isBuyer = order.purchase.buyer_id === session.user.id;
        if (!isBuyer) throw new Error("Only the buyer can select shipping option.");

        const shippingAddress = order.shipping_address as any;
        if (!shippingAddress) throw new Error("Please provide shipping address first.");

        let selectedRate: {
            id: string;
            carrier: string;
            serviceLevel: string;
            amount: string;
            currency: string;
            estimatedDays?: number;
        } | null = null;

        if (shipmentId) {
            selectedRate = await getShipmentRateById(shipmentId, rateId);
        }

        if (!selectedRate && selectedRateMeta?.amount && selectedRateMeta?.currency) {
            // Fallback: trust rate details from the just-selected client option.
            // Final validation happens when seller purchases the label with Shippo.
            selectedRate = {
                id: rateId,
                carrier: carrier,
                serviceLevel: selectedRateMeta.serviceLevel || "Shipping",
                amount: selectedRateMeta.amount,
                currency: selectedRateMeta.currency,
                estimatedDays: selectedRateMeta.estimatedDays
            };
        }

        if (!selectedRate) throw new Error("Selected shipping option is no longer available. Please choose again.");

        await (prisma as any).order.update({
            where: { id: orderId },
            data: {
                shipping_stage: "OPTION_SELECTED",
                shipping_status: "NOT_SHIPPED",
                shipping_option_rate_id: selectedRate.id,
                shipping_option_carrier: selectedRate.carrier || carrier,
                shipping_option_service: selectedRate.serviceLevel,
                shipping_option_amount: selectedRate.amount,
                shipping_option_currency: selectedRate.currency,
                shipping_option_selected_at: new Date()
            }
        });

        revalidatePath("/buy/success");
        revalidatePath("/dashboard/purchases");
        revalidatePath("/dashboard/sales");
        return { success: true };
    } catch (error: any) {
        console.error("selectShippingRate error:", error);
        return { error: error.message || "Failed to purchase shipping label." };
    }
}

export async function getSellerLabelSelection(orderId: string) {
    try {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Unauthorized");

        const order = await (prisma as any).order.findUnique({
            where: { id: orderId },
            include: { purchase: { include: { listing: true } } }
        });

        if (!order) throw new Error("Order not found");
        if (order.purchase.listing.user_id !== session.user.id) {
            throw new Error("Unauthorized access to order.");
        }

        const shippingAddress = (order.shipping_address || {}) as any;
        const hasBuyerAddress = order.shipping_stage !== "ADDRESS_MISSING" && !!shippingAddress.line1 && !!shippingAddress.city && !!shippingAddress.state && !!shippingAddress.postal_code;
        const hasBuyerSelection = order.shipping_stage === "OPTION_SELECTED" && !!order.shipping_option_rate_id;

        return {
            success: true,
            hasLabel: !!order.label_url,
            shippingStage: order.shipping_stage,
            hasBuyerAddress,
            hasBuyerSelection,
            selection: hasBuyerSelection ? {
                rateId: order.shipping_option_rate_id,
                carrier: order.shipping_option_carrier,
                serviceLevel: order.shipping_option_service,
                amount: order.shipping_option_amount,
                currency: order.shipping_option_currency,
                estimatedDays: undefined
            } : null
        };
    } catch (error: any) {
        return { error: error.message || "Failed to load shipping selection." };
    }
}

export async function purchaseSelectedShippingLabel(orderId: string) {
    try {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Unauthorized");

        const order = await (prisma as any).order.findUnique({
            where: { id: orderId },
            include: { purchase: { include: { listing: true } } }
        });

        if (!order) throw new Error("Order not found");
        if (order.purchase.listing.user_id !== session.user.id) {
            throw new Error("Only the seller can generate this label.");
        }
        if (order.label_url || order.shipping_stage === "LABEL_PURCHASED") {
            return { success: true };
        }

        const selectedRateId = order.shipping_option_rate_id;
        const selectedCarrier = order.shipping_option_carrier;
        if (!selectedRateId) {
            throw new Error("Buyer has not selected a shipping option yet.");
        }
        if (order.shipping_stage !== "OPTION_SELECTED") {
            throw new Error("Order is not ready for label purchase.");
        }

        const labelData = await purchaseLabel(selectedRateId);
        await prisma.$transaction(async (tx: any) => {
            const latest = await tx.order.findUnique({ where: { id: orderId } });
            if (!latest) throw new Error("Order not found");
            if (latest.label_url || latest.shipping_stage === "LABEL_PURCHASED") return;

            await tx.order.update({
                where: { id: orderId },
                data: {
                    shipping_stage: "LABEL_PURCHASED",
                    shipping_status: "PROCESSING",
                    tracking_number: labelData.tracking_number,
                    carrier: selectedCarrier || "Carrier",
                    shippo_transaction_id: labelData.shippo_transaction_id,
                    label_url: labelData.label_url
                }
            });
        });

        revalidatePath("/buy/success");
        revalidatePath("/dashboard/purchases");
        revalidatePath("/dashboard/sales");
        return { success: true };
    } catch (error: any) {
        console.error("purchaseSelectedShippingLabel error:", error);
        return { error: error.message || "Failed to purchase shipping label." };
    }
}
