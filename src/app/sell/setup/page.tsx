import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { onboardSellerAction } from "@/app/actions/stripe";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ChevronRight, CreditCard, Heart, ShieldCheck, TrendingUp, Users } from "lucide-react";

export const dynamic = "force-dynamic";

async function startStripeOnboarding() {
    "use server";
    const result = await onboardSellerAction();
    if (result?.url) redirect(result.url);
}

const sellerBenefits = [
    {
        title: "Keep 85% of your sale",
        desc: "Only a 15% platform fee, designed for modest fashion sellers.",
        icon: TrendingUp,
        iconBg: "#d6edd9",
        iconColor: "#2f9a43",
    },
    {
        title: "Dedicated buyer audience",
        desc: "Shoppers actively looking for modest fashion with stronger conversion.",
        icon: Users,
        iconBg: "#cfe2f6",
        iconColor: "#246fcd",
    },
    {
        title: "Buyer protection built-in",
        desc: "Secure payments, dispute support, and trust signals boost sales.",
        icon: Heart,
        iconBg: "#f3d3e2",
        iconColor: "#ce2f3b",
    },
    {
        title: "Fast, direct payouts",
        desc: "Powered by Stripe Connect with direct transfer to your bank.",
        icon: CreditCard,
        iconBg: "#e8d5f1",
        iconColor: "#7a2dc2",
    },
] as const;

export default async function SellSetupPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login?callbackUrl=/sell/setup");
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { seller_enabled: true },
    });

    // Already fully connected — no setup needed.
    if (user?.seller_enabled) {
        redirect("/dashboard/earnings");
    }

    return (
        <div className="bg-[#f4efea] px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-[1360px] flex-col overflow-hidden bg-[#f4efea] sm:rounded-[2rem] sm:border sm:border-border/80 sm:shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
                <section
                    className="relative overflow-hidden border-b border-border/80 px-5 pb-6 pt-4 text-center sm:px-10 sm:pb-10 sm:pt-9 lg:px-14"
                    style={{ backgroundImage: "linear-gradient(120deg,#3e2619 0%,#6d4327 45%,#a4774f 100%)" }}
                >
                    <div className="pointer-events-none absolute -left-14 bottom-4 h-36 w-36 rounded-full bg-white/7" />
                    <div className="pointer-events-none absolute -right-10 -top-8 h-44 w-44 rounded-full bg-white/9" />
                    <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/35 bg-white/10 text-3xl sm:mb-5 sm:h-16 sm:w-16 sm:text-4xl">
                        🏪
                    </div>
                    <h1 className="font-serif text-[23px] font-medium leading-[1.05] text-white">
                        Set Up Payouts on Modaire
                    </h1>
                    <p className="mx-auto mt-2 max-w-2xl text-[0.94rem] leading-[1.55] text-[#f1ddd0] sm:mt-4 sm:text-[1.1rem] sm:leading-[1.8]">
                        Connect Stripe so you can receive payment for items you sell.
                    </p>
                    <div className="mx-auto mt-4 w-full max-w-md sm:mt-7">
                        <form action={startStripeOnboarding}>
                            <Button
                                type="submit"
                                size="lg"
                                className="h-11 w-full rounded-full bg-[#aa8464] px-6 text-[0.9rem] font-semibold tracking-[0.03em] text-white hover:bg-[#946f52] sm:h-14 sm:px-8 sm:text-[1.04rem]"
                            >
                                Continue to Stripe Setup
                                <ChevronRight className="ml-2 h-5 w-5" />
                            </Button>
                        </form>
                    </div>
                </section>

                <section className="px-5 py-5 sm:px-10 sm:py-10 lg:px-14">
                    <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#8d7565]">Why Connect Stripe</p>

                    <div className="mt-3 space-y-4 sm:mt-5 sm:space-y-6">
                        {sellerBenefits.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.title} className="flex items-center gap-4 sm:gap-5">
                                    <div
                                        className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden border border-black/5 sm:h-[76px] sm:w-[76px]"
                                        style={{
                                            backgroundColor: item.iconBg,
                                            borderRadius: "12px",
                                            clipPath: "inset(0 round 12px)",
                                        }}
                                    >
                                        <Icon className="h-6 w-6 sm:h-9 sm:w-9" style={{ color: item.iconColor, strokeWidth: 2.3 }} />
                                    </div>
                                    <div className="flex min-h-[56px] flex-col justify-center sm:min-h-[76px]">
                                        <h3 className="text-[0.95rem] font-semibold leading-[1.18] text-foreground sm:text-[1.25rem]">{item.title}</h3>
                                        <p className="mt-0 max-w-3xl text-[0.66rem] leading-[1.55] text-[#8d7565] sm:text-[0.94rem]">
                                            {item.desc}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-5 rounded-[1.4rem] border border-[#b7d9d0] bg-[#d8e9e7] px-4 py-3 text-[#2f7f5d] sm:mt-10 sm:rounded-[2rem] sm:px-8 sm:py-6">
                        <p className="flex items-start gap-2 text-[0.84rem] leading-[1.42] sm:gap-4 sm:text-[0.98rem] sm:leading-[1.35]">
                            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 sm:mt-1 sm:h-9 sm:w-9" />
                            <span>
                                <strong className="font-semibold text-[#256f4f]">You can keep listing and shopping in the meantime.</strong>{" "}
                                Stripe setup is only needed when you&apos;re ready to receive payouts for items you sell.
                            </span>
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
