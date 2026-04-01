interface Props {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "blue" | "purple" | "orange";
}

const colors = {
  default: "border-gray-700",
  green: "border-emerald-500",
  blue: "border-blue-500",
  purple: "border-purple-500",
  orange: "border-orange-500",
};

export default function StatCard({ label, value, sub, color = "default" }: Props) {
  return (
    <div className={`bg-gray-900 border ${colors[color]} rounded-xl p-4`}>
      <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
