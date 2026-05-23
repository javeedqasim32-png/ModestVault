import { getSellerPromptState } from "@/app/actions/stripe";
import SellerPromptModal from "./SellerPromptModal";

// Server component that decides whether to mount the seller-prompt modal at all.
// Renders nothing for logged-out visitors or users who are already fully onboarded sellers.
export default async function SellerPromptModalGate() {
    const state = await getSellerPromptState();
    if (!state) return null;
    return <SellerPromptModal state={state} />;
}
