import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck, Globe } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero Section — Full-bleed like J. */}
      <section className="relative w-full h-[85vh] bg-primary flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/50" />
        <div className="relative z-10 text-center space-y-8 px-6">
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-tight">
            Modest Fashion,<br />Reimagined
          </h1>
          <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto">
            Discover curated collections of premium modest fashion from sellers worldwide.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/browse">
              <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-black px-12">
                Shop Now
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* New Arrivals — Horizontal card section like J. */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="flex items-end justify-between mb-12">
            <h2 className="font-serif text-4xl md:text-5xl font-bold text-foreground">
              Shop For New Arrivals
            </h2>
            <Link href="/browse" className="hidden md:flex items-center gap-2 text-xs uppercase tracking-widest font-medium text-muted-foreground hover:text-foreground transition-colors">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { title: "Heritage Edit", desc: "Rooted in legacy, styled for now." },
              { title: "Unstitched Collection", desc: "Premium fabrics, your design." },
              { title: "Essentials '26", desc: "Refresh your wardrobe with essentials." },
              { title: "Ready to Wear", desc: "Curated pieces that celebrate your style." },
            ].map((item, i) => (
              <Link key={i} href="/browse" className="group block">
                <div className="aspect-[3/4] bg-muted mb-4 overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-br from-accent/50 to-muted group-hover:scale-105 transition-transform duration-700" />
                </div>
                <h3 className="font-serif text-lg md:text-xl font-semibold text-foreground mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {item.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Shop By Category — Like J.'s category grid */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-6 lg:px-10">
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-foreground mb-12">
            Shop By Category
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { title: "Dresses & Gowns", count: "1,200+" },
              { title: "Premium Outerwear", count: "850+" },
              { title: "Bespoke Accessories", count: "2,000+" },
              { title: "Footwear", count: "1,400+" },
            ].map((cat, i) => (
              <Link key={i} href="/browse" className="group block">
                <div className="aspect-[3/4] bg-accent/30 overflow-hidden mb-4">
                  <div className="w-full h-full bg-gradient-to-br from-accent to-muted/50 group-hover:scale-105 transition-transform duration-700" />
                </div>
                <h3 className="font-serif text-lg font-semibold text-foreground group-hover:opacity-70 transition-opacity">
                  {cat.title}
                </h3>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
                  {cat.count} Items
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Clean editorial */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            <div className="space-y-5">
              <ShieldCheck className="w-8 h-8 text-foreground" />
              <h3 className="font-serif text-2xl font-semibold">Verified Sellers</h3>
              <p className="text-muted-foreground leading-relaxed">
                Every seller goes through Stripe-powered verification to ensure authenticity and trust.
              </p>
            </div>
            <div className="space-y-5">
              <Truck className="w-8 h-8 text-foreground" />
              <h3 className="font-serif text-2xl font-semibold">Secure Shipping</h3>
              <p className="text-muted-foreground leading-relaxed">
                Items shipped with care, trackable from seller to your doorstep.
              </p>
            </div>
            <div className="space-y-5">
              <Globe className="w-8 h-8 text-foreground" />
              <h3 className="font-serif text-2xl font-semibold">Global Community</h3>
              <p className="text-muted-foreground leading-relaxed">
                Connect with modest fashion lovers and sellers from around the world.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter CTA — Like J.'s dark section */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="container mx-auto px-6 lg:px-10 text-center space-y-8">
          <h2 className="font-serif text-4xl md:text-6xl font-bold">
            Be The First To Know
          </h2>
          <p className="text-primary-foreground/60 text-lg max-w-xl mx-auto">
            Sign up for our newsletter and get early access to new arrivals, exclusive offers, and curated collections.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-lg mx-auto">
            <input
              type="email"
              placeholder="Your email address"
              className="w-full sm:flex-1 bg-transparent border border-primary-foreground/30 px-6 py-4 text-sm text-primary-foreground placeholder:text-primary-foreground/40 focus:outline-none focus:border-primary-foreground transition-colors"
            />
            <Button variant="outline" size="lg" className="border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary w-full sm:w-auto">
              Subscribe
            </Button>
          </div>
        </div>
      </section>

      {/* Footer — Multi-column like J. */}
      <footer className="bg-background border-t border-border py-16">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
            <div>
              <h4 className="font-serif text-lg font-semibold mb-6">Shop</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/browse" className="hover:text-foreground transition-colors">New Arrivals</Link></li>
                <li><Link href="/browse" className="hover:text-foreground transition-colors">Women</Link></li>
                <li><Link href="/browse" className="hover:text-foreground transition-colors">Men</Link></li>
                <li><Link href="/browse" className="hover:text-foreground transition-colors">Accessories</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-serif text-lg font-semibold mb-6">Sell</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/sell" className="hover:text-foreground transition-colors">Start Selling</Link></li>
                <li><Link href="/dashboard" className="hover:text-foreground transition-colors">Seller Dashboard</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Seller Guidelines</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-serif text-lg font-semibold mb-6">Company</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground transition-colors">About Us</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Contact</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-serif text-lg font-semibold mb-6">Legal</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Refund Policy</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <Link href="/" className="font-serif text-2xl font-bold">M.</Link>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              &copy; 2026 ModestVault. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
