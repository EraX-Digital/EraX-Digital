import { chainProgramEvents, type Database } from '@erax/database'
import type { DecodedSolanaCreatorEvent } from '@erax/wallet-solana/creator-programs'

export async function storeSolanaCreatorEvents(
  db: Database,
  input: {
    network: string
    signature: string
    slot: number | null
    events: readonly DecodedSolanaCreatorEvent[]
  },
): Promise<number> {
  let stored = 0
  for (const [eventIndex, event] of input.events.entries()) {
    const inserted = await db
      .insert(chainProgramEvents)
      .values({
        network: input.network,
        signature: input.signature,
        eventIndex,
        programId: event.programId,
        eventName: event.eventName,
        slot: input.slot === null ? null : BigInt(input.slot),
        payload: event.payload,
        status: 'finalized',
      })
      .onConflictDoNothing()
      .returning()
    if (inserted[0]) stored += 1
  }
  return stored
}
