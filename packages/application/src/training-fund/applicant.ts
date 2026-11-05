import { parseObject } from '@district/contracts/boundary';

export class ApplicantSelectionError extends Error {}

export interface ApplicantDirectory {
  findActiveApplicantById(userId: string): Promise<{ id: string; name: string; email: string } | null>;
}

/** Browser owns the UUID selection; the server owns all contact details. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export async function resolveTrainingFundApplicant(value: unknown, directory: ApplicantDirectory) {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApplicantSelectionError('Select an applicant from the member search.');
  const body = parseObject(value);
  const applicant = body.applicant;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (body.schemaVersion !== '1.1' || !applicant || typeof applicant !== 'object' || Array.isArray(applicant)) throw new ApplicantSelectionError('Select an applicant from the member search.');
  const selection = parseObject(applicant);

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (Object.keys(selection).some(key => key !== 'userId') || typeof selection.userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selection.userId)) throw new ApplicantSelectionError('Select a valid member from the search results.');
  const user = await directory.findActiveApplicantById(selection.userId);

  if (!user) throw new ApplicantSelectionError('This member is inactive or has no unique contact email. Please choose another member or update their directory details.');

  return { ...body, schemaVersion: '1.1' as const, applicant: { userId: user.id, name: user.name, email: user.email } };
}
