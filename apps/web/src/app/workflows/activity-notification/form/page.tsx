export const metadata = { title: 'Activity Approvals · Form' };
export const dynamic = 'force-dynamic';

export default function Page() {
  const membersOrigin = process.env.MEMBERS_SESSION_URL ? new URL(process.env.MEMBERS_SESSION_URL).origin : undefined;
  const formUrl = process.env.ACTIVITY_NOTIFICATION_FORM_URL || (membersOrigin ? new URL('/members/adventurous-out-of-district-notifications', membersOrigin).toString() : undefined);

  return <><header className="page-hero"><div className="container"><p className="eyebrow">Activity Approvals / Form</p><h1>Submit an activity notification</h1><p>Tell the district about an adventurous or out-of-district activity.</p></div></header>
    <section className="section container guide"><h2>Start in the members area</h2><p>Use the Activity notifications form on the district members website. You’ll need your activity details, participating sections, leader contacts and supporting risk assessment.</p>
      {formUrl && <p><a className="button" href={formUrl}>Open activity notification form →</a></p>}
      <h2>What happens next</h2><p>Once submitted, your notification appears here as an approval case. The first approval from the activity out-of-district team completes the review, and an approval email is sent to the contact on the form.</p>
    </section></>;
}
