import React from "react";
import {cn} from "./cn";

export function Card({
  className, interactive, children, ...rest
}: React.HTMLAttributes<HTMLDivElement> & {interactive?: boolean}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface",
        interactive &&
          // Lift on hover, but only translate and shadow — animating layout
          // properties here would reflow the whole grid on every pointer move.
          "transition-[transform,box-shadow,border-color] duration-normal ease-out " +
          "hover:-translate-y-0.5 hover:shadow-raised hover:border-line-strong",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({className, ...rest}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pt-5 pb-3", className)} {...rest} />;
}
export function CardBody({className, ...rest}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...rest} />;
}
/**
 * Defaults to h3, but the level is the caller's to set: a card directly under an h1
 * needs an h2, and axe rightly flags a skipped level as a heading-order violation.
 */
export function CardTitle({
  as: Tag = "h3", className, ...rest
}: React.HTMLAttributes<HTMLHeadingElement> & {as?: "h2" | "h3" | "h4"}) {
  return <Tag className={cn("text-md font-semibold", className)} {...rest} />;
}
