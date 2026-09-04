"use client";
import React from "react";
import {Select} from "@/components/ui/Input";
import {Button} from "@/components/ui/Button";
import {estimateCredits, type GenerationType, type Quality} from "@/core/generation/catalog";

const TYPES: {value: GenerationType; label: string}[] = [
  {value: "product_hero", label: "Product hero shot"},
  {value: "product_lifestyle", label: "Lifestyle scene"},
  {value: "campaign", label: "Campaign set"},
  {value: "collection", label: "Collection layout"},
  {value: "banner", label: "Storefront banner"},
  {value: "social_creative", label: "Social creative"},
];
const QUALITIES: {value: Quality; label: string}[] = [
  {value: "draft", label: "Draft — fastest, lowest cost"},
  {value: "standard", label: "Standard"},
  {value: "high", label: "High — best detail"},
];

export function GenerationForm({
  onSubmit, submitting, creditsAvailable,
}: {
  onSubmit: (input: {type: GenerationType; quality: Quality; count: number}) => void;
  submitting: boolean;
  creditsAvailable?: number;
}) {
  const [type, setType] = React.useState<GenerationType>("product_hero");
  const [quality, setQuality] = React.useState<Quality>("standard");
  const [count, setCount] = React.useState(1);

  const estimated = estimateCredits(type, quality, count);
  // Showing the cost before the click is what stops a user discovering the price
  // only when they are told they cannot afford it.
  const tooExpensive = typeof creditsAvailable === "number" && estimated > creditsAvailable;

  return (
    <form
      className="space-y-5"
      onSubmit={e => { e.preventDefault(); onSubmit({type, quality, count}); }}
    >
      <Select label="Shot type" value={type} onChange={e => setType(e.target.value as GenerationType)}>
        {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </Select>

      <Select label="Quality" value={quality} onChange={e => setQuality(e.target.value as Quality)}>
        {QUALITIES.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
      </Select>

      <Select
        label="How many images" value={String(count)}
        onChange={e => setCount(Number(e.target.value))}
        hint="Each image costs credits. You're only charged for what's delivered."
      >
        {[1, 2, 4, 6, 8].map(n => <option key={n} value={n}>{n}</option>)}
      </Select>

      <div className="flex items-center justify-between rounded-md border border-line bg-surface-raised px-4 py-3">
        <span className="text-sm text-ink-muted">Estimated cost</span>
        <span className="text-base font-semibold tabular-nums">{estimated} credits</span>
      </div>

      {tooExpensive && (
        <p role="alert" className="text-sm font-medium text-danger">
          That&rsquo;s more than your {creditsAvailable} remaining credits. Reduce the count or quality.
        </p>
      )}

      <Button type="submit" loading={submitting} loadingLabel="Starting…" disabled={tooExpensive} fullWidth size="lg">
        Generate
      </Button>
    </form>
  );
}
