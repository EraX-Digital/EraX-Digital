import { encodeFunctionData, getAddress, type Hex } from 'viem'
import type { UnsignedEvmTransaction } from './index'

export const creatorRegistryAbi = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'metadataUri', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'registerWithPayout',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'metadataUri', type: 'string' },
      { name: 'payout', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateMetadata',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'metadataUri', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updatePayout',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'payout', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isRegistered',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'payoutOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getCreator',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'payout', type: 'address' },
      { name: 'metadataUri', type: 'string' },
      { name: 'registeredAt', type: 'uint64' },
    ],
  },
  {
    type: 'event',
    name: 'CreatorRegistered',
    inputs: [
      { name: 'creator', type: 'address', indexed: true },
      { name: 'payout', type: 'address', indexed: true },
      { name: 'metadataUri', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CreatorMetadataUpdated',
    inputs: [
      { name: 'creator', type: 'address', indexed: true },
      { name: 'metadataUri', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CreatorPayoutUpdated',
    inputs: [
      { name: 'creator', type: 'address', indexed: true },
      { name: 'previousPayout', type: 'address', indexed: true },
      { name: 'payout', type: 'address', indexed: true },
    ],
  },
] as const

export const creatorTippingAbi = [
  {
    type: 'function',
    name: 'tip',
    stateMutability: 'payable',
    inputs: [{ name: 'creator', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'tipCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'registry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event',
    name: 'TipSent',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'payout', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'tipId', type: 'uint256', indexed: false },
    ],
  },
] as const

function contractAddress(value: string, label: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${label} is not a deployed contract address`)
  }
  return getAddress(value)
}

export function buildCreatorRegistration(input: {
  chainId: number
  registry: string
  metadataUri: string
}): UnsignedEvmTransaction {
  return {
    chainId: input.chainId,
    to: contractAddress(input.registry, 'CreatorRegistry'),
    value: 0n,
    data: encodeFunctionData({
      abi: creatorRegistryAbi,
      functionName: 'register',
      args: [input.metadataUri],
    }),
  }
}

export function buildCreatorMetadataUpdate(input: {
  chainId: number
  registry: string
  metadataUri: string
}): UnsignedEvmTransaction {
  return {
    chainId: input.chainId,
    to: contractAddress(input.registry, 'CreatorRegistry'),
    value: 0n,
    data: encodeFunctionData({
      abi: creatorRegistryAbi,
      functionName: 'updateMetadata',
      args: [input.metadataUri],
    }),
  }
}

export function buildCreatorTip(input: {
  chainId: number
  tipping: string
  creator: string
  amountBaseUnits: bigint
}): UnsignedEvmTransaction {
  if (input.amountBaseUnits <= 0n) throw new Error('Tip amount must be greater than zero')
  return {
    chainId: input.chainId,
    to: contractAddress(input.tipping, 'CreatorTipping'),
    value: input.amountBaseUnits,
    data: encodeFunctionData({
      abi: creatorTippingAbi,
      functionName: 'tip',
      args: [getAddress(input.creator)],
    }),
  }
}

export function creatorCalldataSelector(data: Hex): string {
  return data.slice(0, 10)
}
