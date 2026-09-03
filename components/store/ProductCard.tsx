import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { formatPrice } from "@/lib/money/format";
import type { CatalogProduct } from "@/lib/data/products";

interface ProductCardProps {
  product: CatalogProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/producto/${product.slug}`}
      className="group flex flex-col gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    >
      <div className="relative">
        <RemoteImage
          src={product.imageUrl}
          alt={product.imageAlt}
          blurDataURL={product.imageBlurDataUrl}
        />
        {product.isNew ? (
          <Badge tone="accent" className="absolute left-2 top-2">
            Nuevo
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-black transition-colors group-hover:text-gray-700">
          {product.name}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={
              product.compareAtPrice
                ? "text-sm font-semibold text-red"
                : "text-sm font-semibold text-black"
            }
          >
            {formatPrice(product.price, product.currencyCode, product.locale)}
          </span>
          {product.compareAtPrice ? (
            <span className="text-xs text-gray-400 line-through">
              {formatPrice(product.compareAtPrice, product.currencyCode, product.locale)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
