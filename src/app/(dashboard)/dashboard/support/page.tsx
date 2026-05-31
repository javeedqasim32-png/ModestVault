import { ChevronLeft, ChevronRight, MessageSquarePlus, AlertCircle, Mail, Phone } from "lucide-react";
import Link from "next/link";

export default function SupportPage() {
    const supportEmail = "shopmodaire@gmail.com";
    const supportPhone = "8172627618";

    return (
        <div className="flex-1 bg-[#f4efea] pb-[96px] lg:pb-6" style={{ fontFamily: "var(--font-sans), sans-serif" }}>
            <div className="mx-auto w-full max-w-[860px] overflow-hidden border-y border-[#ddd3cb] bg-[#f4efea]">
                
                {/* Header with Back Button */}
                <section className="border-b border-[#ddd3cb] px-6 py-6 sm:px-8 sm:py-8">
                    <div className="flex items-center gap-4">
                        <Link 
                            href="/dashboard"
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d7cac0] bg-[#f4efea] transition hover:bg-[#ede7df]"
                        >
                            <ChevronLeft className="h-5 w-5 text-[#2f2925]" />
                        </Link>
                        <h1 className="text-[32px] leading-[1.1] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
                            Support & FAQ
                        </h1>
                    </div>
                </section>

                <section className="px-6 py-8 sm:px-8">
                    <div className="space-y-6">
                        
                        {/* Request New Feature */}
                        <a 
                            href={`mailto:${supportEmail}?subject=New Feature Request for Modaire`}
                            className="group flex items-center justify-between rounded-[30px] border border-[#d9cfc7] bg-[#f7f2ed] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition hover:bg-[#f2ebe4]"
                        >
                            <div className="flex items-center gap-5">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fdfaf7] border border-[#e8dfd8] text-[#8f6e59]">
                                    <MessageSquarePlus className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-[17px] font-semibold text-[#2f2925]">Request New Feature</h3>
                                    <p className="text-[14px] text-[#8a7667] mt-0.5">Help us make the marketplace better</p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-[#8f6e59] transition group-hover:translate-x-1" />
                        </a>

                        {/* Report an Issue */}
                        <div className="rounded-[30px] border border-[#d9cfc7] bg-[#f7f2ed] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                            <div className="flex items-center gap-5 mb-8">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fdfaf7] border border-[#e8dfd8] text-[#8f6e59]">
                                    <AlertCircle className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-[20px] font-semibold text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>Report an Issue</h3>
                                    <p className="text-[14px] text-[#8a7667] mt-0.5">We're here to help you resolve any problems</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <a 
                                    href={`mailto:${supportEmail}`}
                                    className="flex items-center gap-4 rounded-2xl border border-[#e8dfd8] bg-[#fdfaf7] p-4 transition hover:bg-white"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4efea] text-[#8f6e59]">
                                        <Mail className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-medium uppercase tracking-wider text-[#8f6e59]">Email Us</p>
                                        <p className="text-[15px] font-semibold text-[#2f2925]">{supportEmail}</p>
                                    </div>
                                </a>

                                <a 
                                    href={`tel:${supportPhone}`}
                                    className="flex items-center gap-4 rounded-2xl border border-[#e8dfd8] bg-[#fdfaf7] p-4 transition hover:bg-white"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4efea] text-[#8f6e59]">
                                        <Phone className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-medium uppercase tracking-wider text-[#8f6e59]">Call or Text</p>
                                        <p className="text-[15px] font-semibold text-[#2f2925]">{supportPhone}</p>
                                    </div>
                                </a>
                            </div>
                        </div>

                    </div>
                </section>

                {/* Footer Section */}
                <section className="px-6 py-10 text-center sm:px-8 border-t border-[#ddd3cb] mt-8 bg-[#ede7df]/30">
                    <p className="text-[13px] text-[#8a7667]">
                        Modaire Support is available 7 days a week.
                    </p>
                </section>

            </div>
        </div>
    );
}
