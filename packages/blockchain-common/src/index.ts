export type PlannedNetwork = {
  family: 'evm' | 'solana'
  caip2: string
  name: string
}

export const plannedNetworks: PlannedNetwork[] = [
  { family: 'evm', caip2: 'eip155:1', name: 'Ethereum' },
  { family: 'evm', caip2: 'eip155:8453', name: 'Base' },
  { family: 'solana', caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', name: 'Solana' },
]

export function indexingStatus() {
  return {
    state: 'not_configured' as const,
    networks: plannedNetworks.map((network) => ({
      ...network,
      connected: false as const,
    })),
  }
}
