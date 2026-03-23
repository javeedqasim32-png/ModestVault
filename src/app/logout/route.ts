import { signOut } from "@/auth";

export async function GET() {
  await signOut({ redirectTo: "/login?loggedOut=1" });
}
