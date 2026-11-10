// Wire types for the version 1 district-site schemas. Conditional rules are enforced by the parser.
export type ActivityNotification = {
  idempotenceKey: string;
  activity: string;
  location: string;
  venueName: string;
  leaderName: string;
  timeZone: string;
  notificationType: "out-of-district" | "adventurous" | "both";
  startsAt: string;
  endsAt: string;
  sectionIds: (number)[];
  sectionParticipants: ({
  sectionId: number;
  youngPeople: number;
})[];
  youngPeople: number;
  youngLeaders: number;
  adults: number;
  leaders: ({
  id: string;
  memberId: string | null;
  name: string;
  email: string | "";
  phone: string | "";
  membershipNumber?: string;
  parentWithoutDbs?: boolean;
  inCharge: boolean;
})[];
  memberId: string | null;
  membershipNumber?: string;
  email: string;
  phone: string;
  notes: string;
  declaration: true;
  groups: (string)[];
  sections: (string)[];
  adultTraining: "Yes";
  trainedLeader: "Yes";
  authorised: "Yes";
  externalProvider?: "Yes" | "No";
  provider?: string;
  requiresWaiver?: boolean;
  waiverReviewed?: "Yes";
  permitHolderId?: string;
  validPermit?: "Yes";
};

export type QueuedActivityNotification = {
  schemaVersion: 1;
  submissionId: string;
  environment: "dev" | "test" | "prod";
  submittedAt: string;
  submittedBy: string;
  notification: ActivityNotification;
  files: ({
  kind: "riskAssessment" | "providerInsurance" | "providerWaiver";
  name: string;
  size: number;
  sha256: string;
  bucket: string;
  key: string;
  versionId: string;
})[];
  formType: "activity-notification";
  authenticatedSubmitter: {
  subject: string;
  issuer: string;
  authenticatedAt: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
};
};
