import { parseObject } from '@district/contracts/boundary';

import { fetchCollection } from './collection';

export interface DirectoryTag { id: string; tagName: string; tagCode: string; emails: { memberId: string; email: string }[] }

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export function parseTag(value: unknown): DirectoryTag {
  const tag = parseObject(value, 'Invalid district-team tag');

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!tag || typeof tag.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(tag.id)
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    || typeof tag.tag_label !== 'string' || !tag.tag_label.trim()
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    || typeof tag.tag_code !== 'string' || !/^[A-Za-z0-9-]+$/.test(tag.tag_code))
    throw new Error('Invalid district-team tag');

  if (!Array.isArray(tag.current_appointments)) throw new Error('Missing tag appointments');

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
  const emails = tag.current_appointments.map((value: unknown) => {
    const appointment = parseObject(value, 'Invalid tag appointment email');

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    if (!appointment || typeof appointment.member_id !== 'string'
      || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(appointment.member_id)
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
      || typeof appointment.contact_method !== 'string'
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appointment.contact_method.trim()))
      throw new Error('Invalid tag appointment email');

    return { memberId: appointment.member_id.toLowerCase(), email: appointment.contact_method.trim().toLowerCase() };
  });

  return { emails, id: tag.id.toLowerCase(), tagName: tag.tag_label, tagCode: tag.tag_code };
}

export async function fetchTags(fetcher: typeof fetch = fetch): Promise<DirectoryTag[]> {
  const endpoint = process.env.DISTRICT_TEAM_TAGS_URL;

  if (!endpoint) throw new Error('DISTRICT_TEAM_TAGS_URL is required');
  const tags = await fetchCollection(endpoint, parseTag, fetcher);

  if (new Set(tags.map(tag => tag.tagCode)).size !== tags.length) throw new Error('Duplicate district-team tag code');

  return tags;
}
