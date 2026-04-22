interface Props {
  title: string
  value: string
  icon: string
  color: string
  subtitle?: string
}

export default function MetricCard({ title, value, icon, color, subtitle }: Props) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-opacity-10 ${color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100')}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
