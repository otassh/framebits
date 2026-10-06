import { ShimmerButton } from "./shimmer-button";

export default function ShimmerButtonDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ShimmerButton label="Shimmer" />
      <ShimmerButton label="Disabled" disabled />
    </div>
  );
}
