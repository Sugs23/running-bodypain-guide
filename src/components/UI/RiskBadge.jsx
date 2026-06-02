import { getRiskLevel } from '../../utils/riskEngine'

export function RiskBadge({ muscleId, riskScores, style }) {
  const score = riskScores?.[muscleId]
  const risk  = getRiskLevel(score)
  if (!risk) return null

  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: 99,
      background: risk.color + '22',
      color: risk.color,
      border: `1px solid ${risk.color}44`,
      ...style,
    }}>
      {risk.label}
    </span>
  )
}