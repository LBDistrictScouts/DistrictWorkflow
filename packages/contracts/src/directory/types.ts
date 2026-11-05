/** One active user/appointment-email match for a role tag. A user can have multiple matches. */
export interface RoleUser { id: string; name: string; appointmentEmail: string }

export interface MemberProfile { id: string; name: string; appointments: { role: string; team: string; email: string }[] }
