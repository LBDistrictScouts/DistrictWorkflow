# Reusable payment workflow definition

`packages/domain/src/payments/machine.ts` exports `paymentFlowMachine`. It is a
standalone XState workflow definition, invoked by Training Fund's `payment` state.
It can be invoked by other process definitions without importing Training Fund.
Shared input, event and output types are in `packages/contracts/src/payments/types.ts`.

The child sequence is:

```
resolve_treasurer → request_details → awaiting_details → create_payment_task → awaiting_payment → paid
```

The caller supplies:

- `reference`: the source application, expense or reimbursement reference.
- `amountPence` and `currency: 'GBP'`: the authorised positive amount.
- `payee`: recipient name and email.
- `detailsRequest`: purpose, subject, heading, instructions and complex-form fields.

Training Fund configures account-holder name, six-digit sort code and eight-digit
account number. Another caller can configure receipt reference or other supporting
information, or a combination of fields. This uses the standard complex response
field types; it does not add attachment upload support.

An owning orchestrator acknowledges activity/task results with these events:

| Event | Meaning |
| --- | --- |
| `ROLE_USERS_RESOLVED` with `users` | Internal lookup of `district-treasurer` completed |
| `DETAILS_REQUESTED` with `requestId` | The configured response task was created and notified |
| `DETAILS_RECEIVED` with `responseId` | Its matching validated response was securely stored |
| `PAYMENT_TASK_CREATED` with `taskId` | The treasurer task exists |
| `RECORD_PAYMENT` with `payment` | The assigned treasurer recorded a valid reference and date |

The child cannot advance to payment before a matching supporting-details response.
Unrelated response IDs, out-of-order events and payments from another user do not
advance it. The approved amount is fixed by input. The child resolves the treasurer
itself using `resolveRoleUser('district-treasurer')`; callers do not supply a
treasurer. The generic activity returns active users with every associated
appointment email. The payment definition requires exactly one distinct user;
empty or multiple-user results leave it in `resolve_treasurer`. If that one user
has multiple tagged addresses, payment uses the first appointment email in lexical
order. That selection is payment-specific, not a rule imposed by the role activity.
Once resolved, that treasurer is fixed for the
child invocation. As with the other definition I/O steps, the future Temporal
orchestrator runs the activity and acknowledges its result to the machine.

Output contains the source reference, amount/currency, protected response ID,
payment task ID and payment audit record. Raw bank details and supporting answers
are never part of its context or output. The child never transfers money.

Training Fund forwards payment events to its invoked child and uses `invoke.onDone`
to save the output and enter `paid`. It contains no copy of the child states or
payment guards. The parent chart displays the invocation, and an expandable
payment chart shows the separately defined child machine.

This extraction is at the **XState definition** layer. It creates no new Temporal
Workflow Type, does not change the running compatibility workflow, and does not
claim that the full Training Fund runtime integration has been completed. When
that integration is implemented, activities/Temporal will perform the I/O and
acknowledge it to this definition. The standard complex-response activity remains
responsible for recipient notification preferences and protected answer storage.
