export interface AwardRow { membershipNumber: string; description: string; awardDate: string; sourceRow?: number }

import type { MemberProfile } from '../directory/types';

export interface AwardContext extends AwardRow { recipient: MemberProfile }

export interface AwardImportStatus { processed: number; total: number; errors: { row: number; message: string }[]; ready: boolean }
