import type { ReactNode } from "react";

export type BrandId = "googlePlay" | "appStore" | "appStoreConnect" | "lemonSqueezy" | "paddle";

const BRANDS: Record<BrandId, { src: string; alt: string; label: string }> = {
  googlePlay: { src: "/brands/google-play.svg", alt: "Google Play", label: "Google Play" },
  appStore: { src: "/brands/app-store.png", alt: "App Store", label: "App Store" },
  appStoreConnect: { src: "/brands/app-store-connect.png", alt: "App Store Connect", label: "App Store Connect" },
  lemonSqueezy: { src: "/brands/lemon-squeezy.svg", alt: "Lemon Squeezy", label: "Lemon Squeezy" },
  paddle: { src: "/brands/paddle.png", alt: "Paddle", label: "Paddle" },
};

export function BrandLogos({ brands, size = 32 }: { brands: BrandId[]; size?: number }) {
  return (
    <span className="brand-logos">
      {brands.map((id) => {
        const brand = BRANDS[id];
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={id}
            className="brand-logo"
            src={brand.src}
            alt={brand.alt}
            width={size}
            height={size}
          />
        );
      })}
    </span>
  );
}

export function WorksWith({ brands, children }: { brands: BrandId[]; children: ReactNode }) {
  return (
    <span className="works-with">
      <BrandLogos brands={brands} size={22} />
      {children}
    </span>
  );
}

export function ProductTitle({
  as: Tag = "h1",
  brands,
  children,
}: {
  as?: "h1" | "h2";
  brands: BrandId[];
  children: ReactNode;
}) {
  return (
    <div className="product-title">
      <BrandLogos brands={brands} size={Tag === "h1" ? 44 : 36} />
      <Tag>{children}</Tag>
    </div>
  );
}

export function WorksWithPlay() {
  return <WorksWith brands={["googlePlay"]}>Works with Google Play Console</WorksWith>;
}

export function WorksWithAppStore() {
  return <WorksWith brands={["appStore", "appStoreConnect"]}>Works with App Store Connect</WorksWith>;
}

export function WorksWithStores() {
  return <WorksWith brands={["lemonSqueezy", "paddle"]}>Works with Lemon Squeezy and Paddle</WorksWith>;
}
