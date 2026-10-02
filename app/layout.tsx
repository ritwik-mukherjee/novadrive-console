import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import { Footer } from "@/components/shell/Footer";
import { Header } from "@/components/shell/Header";
import { SideNav } from "@/components/shell/SideNav";
import { dataset } from "@/lib/data";
import { zonesOf } from "@/lib/engine";
import "./globals.css";

const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });
const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "NovaDrive CRO Supplier-Risk Console",
  description: "From an alert to the evidence to a sourcing option in three clicks.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const { products, assumptions, entities } = dataset;
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header products={products.map((p) => ({ id: p.id, name: p.name }))} zones={zonesOf(entities)} />
          <main className="flex-1 px-8 py-6">{children}</main>
          <Footer caseCutoff={assumptions.dates.caseCutoff} researchAsOf={assumptions.dates.researchAsOf} />
        </div>
      </body>
    </html>
  );
}
