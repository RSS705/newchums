import Mustache from "mustache";
import { SUBJECTS, type SubjectKey } from "./subjects";

import attendeeRemovedHtml from "./templates/attendeeRemoved.html";
import attendeeRemovedTxt from "./templates/attendeeRemoved.txt";
import communityAnnouncementHtml from "./templates/communityAnnouncement.html";
import communityAnnouncementTxt from "./templates/communityAnnouncement.txt";
import communityJoinApprovedHtml from "./templates/communityJoinApproved.html";
import communityJoinApprovedTxt from "./templates/communityJoinApproved.txt";
import communityJoinDeclinedHtml from "./templates/communityJoinDeclined.html";
import communityJoinDeclinedTxt from "./templates/communityJoinDeclined.txt";
import communityJoinRequestHtml from "./templates/communityJoinRequest.html";
import communityJoinRequestTxt from "./templates/communityJoinRequest.txt";
import communityJoinRequestReopenedHtml from "./templates/communityJoinRequestReopened.html";
import communityJoinRequestReopenedTxt from "./templates/communityJoinRequestReopened.txt";
import communityMemberRemovedHtml from "./templates/communityMemberRemoved.html";
import communityMemberRemovedTxt from "./templates/communityMemberRemoved.txt";
import communityMemberUnblockedHtml from "./templates/communityMemberUnblocked.html";
import communityMemberUnblockedTxt from "./templates/communityMemberUnblocked.txt";
import concernReportAlertHtml from "./templates/concernReportAlert.html";
import concernReportAlertTxt from "./templates/concernReportAlert.txt";
import confirmationRequestUserHtml from "./templates/confirmationRequestUser.html";
import confirmationRequestUserTxt from "./templates/confirmationRequestUser.txt";
import chatMessageNotifyHtml from "./templates/chatMessageNotify.html";
import chatMessageNotifyTxt from "./templates/chatMessageNotify.txt";
import chumInviteHtml from "./templates/chumInvite.html";
import chumInviteTxt from "./templates/chumInvite.txt";
import emailChangeConfirmHtml from "./templates/emailChangeConfirm.html";
import emailChangeConfirmTxt from "./templates/emailChangeConfirm.txt";
import emailChangeNotifyOldHtml from "./templates/emailChangeNotifyOld.html";
import emailChangeNotifyOldTxt from "./templates/emailChangeNotifyOld.txt";
import emailChangeSuccessHtml from "./templates/emailChangeSuccess.html";
import emailChangeSuccessTxt from "./templates/emailChangeSuccess.txt";
import eventChangedHtml from "./templates/eventChanged.html";
import eventChangedTxt from "./templates/eventChanged.txt";
import eventInviteHtml from "./templates/eventInvite.html";
import eventInviteTxt from "./templates/eventInvite.txt";
import eventJoinHtml from "./templates/eventJoin.html";
import eventJoinTxt from "./templates/eventJoin.txt";
import eventLeaveHtml from "./templates/eventLeave.html";
import eventLeaveTxt from "./templates/eventLeave.txt";
import eventMatchDigestHtml from "./templates/eventMatchDigest.html";
import eventMatchDigestTxt from "./templates/eventMatchDigest.txt";
import eventMaybeHtml from "./templates/eventMaybe.html";
import eventMaybeTxt from "./templates/eventMaybe.txt";
import joinRequestApprovedHtml from "./templates/joinRequestApproved.html";
import joinRequestApprovedTxt from "./templates/joinRequestApproved.txt";
import joinRequestDeclinedHtml from "./templates/joinRequestDeclined.html";
import joinRequestDeclinedTxt from "./templates/joinRequestDeclined.txt";
import joinRequestToHostHtml from "./templates/joinRequestToHost.html";
import joinRequestToHostTxt from "./templates/joinRequestToHost.txt";
import magicLinkSignupHtml from "./templates/magicLinkSignup.html";
import magicLinkSignupTxt from "./templates/magicLinkSignup.txt";
import passwordResetHtml from "./templates/passwordReset.html";
import passwordResetTxt from "./templates/passwordReset.txt";
import planAtRiskHtml from "./templates/planAtRisk.html";
import planAtRiskTxt from "./templates/planAtRisk.txt";
import planAutoCancelledHtml from "./templates/planAutoCancelled.html";
import planAutoCancelledTxt from "./templates/planAutoCancelled.txt";
import planFeedbackHtml from "./templates/planFeedback.html";
import planFeedbackTxt from "./templates/planFeedback.txt";
import planRemovedByAdminHtml from "./templates/planRemovedByAdmin.html";
import planRemovedByAdminTxt from "./templates/planRemovedByAdmin.txt";
import planSigninHtml from "./templates/planSignin.html";
import planSigninTxt from "./templates/planSignin.txt";
import roadmapUpdateHtml from "./templates/roadmapUpdate.html";
import roadmapUpdateTxt from "./templates/roadmapUpdate.txt";
import rsvpReconfirmRequestHtml from "./templates/rsvpReconfirmRequest.html";
import rsvpReconfirmRequestTxt from "./templates/rsvpReconfirmRequest.txt";
import signinLinkHtml from "./templates/signinLink.html";
import signinLinkTxt from "./templates/signinLink.txt";
import unreadChatDigestHtml from "./templates/unreadChatDigest.html";
import unreadChatDigestTxt from "./templates/unreadChatDigest.txt";
import verifyEmailHtml from "./templates/verifyEmail.html";
import verifyEmailTxt from "./templates/verifyEmail.txt";

type TemplatePair = { html: string; text: string };

/** Static map of every email template, keyed by basename. New templates
 *  need a row here plus the matching `.html` and `.txt` files in
 *  `./templates/`. */
const TEMPLATES: Record<string, TemplatePair> = {
  attendeeRemoved: { html: attendeeRemovedHtml, text: attendeeRemovedTxt },
  communityAnnouncement: { html: communityAnnouncementHtml, text: communityAnnouncementTxt },
  communityJoinApproved: { html: communityJoinApprovedHtml, text: communityJoinApprovedTxt },
  communityJoinDeclined: { html: communityJoinDeclinedHtml, text: communityJoinDeclinedTxt },
  communityJoinRequest: { html: communityJoinRequestHtml, text: communityJoinRequestTxt },
  communityJoinRequestReopened: { html: communityJoinRequestReopenedHtml, text: communityJoinRequestReopenedTxt },
  communityMemberRemoved: { html: communityMemberRemovedHtml, text: communityMemberRemovedTxt },
  communityMemberUnblocked: { html: communityMemberUnblockedHtml, text: communityMemberUnblockedTxt },
  concernReportAlert: { html: concernReportAlertHtml, text: concernReportAlertTxt },
  confirmationRequestUser: { html: confirmationRequestUserHtml, text: confirmationRequestUserTxt },
  chatMessageNotify: { html: chatMessageNotifyHtml, text: chatMessageNotifyTxt },
  chumInvite: { html: chumInviteHtml, text: chumInviteTxt },
  emailChangeConfirm: { html: emailChangeConfirmHtml, text: emailChangeConfirmTxt },
  emailChangeNotifyOld: { html: emailChangeNotifyOldHtml, text: emailChangeNotifyOldTxt },
  emailChangeSuccess: { html: emailChangeSuccessHtml, text: emailChangeSuccessTxt },
  eventChanged: { html: eventChangedHtml, text: eventChangedTxt },
  eventInvite: { html: eventInviteHtml, text: eventInviteTxt },
  eventJoin: { html: eventJoinHtml, text: eventJoinTxt },
  eventLeave: { html: eventLeaveHtml, text: eventLeaveTxt },
  eventMatchDigest: { html: eventMatchDigestHtml, text: eventMatchDigestTxt },
  eventMaybe: { html: eventMaybeHtml, text: eventMaybeTxt },
  joinRequestApproved: { html: joinRequestApprovedHtml, text: joinRequestApprovedTxt },
  joinRequestDeclined: { html: joinRequestDeclinedHtml, text: joinRequestDeclinedTxt },
  joinRequestToHost: { html: joinRequestToHostHtml, text: joinRequestToHostTxt },
  magicLinkSignup: { html: magicLinkSignupHtml, text: magicLinkSignupTxt },
  passwordReset: { html: passwordResetHtml, text: passwordResetTxt },
  planAtRisk: { html: planAtRiskHtml, text: planAtRiskTxt },
  planAutoCancelled: { html: planAutoCancelledHtml, text: planAutoCancelledTxt },
  planFeedback: { html: planFeedbackHtml, text: planFeedbackTxt },
  planRemovedByAdmin: { html: planRemovedByAdminHtml, text: planRemovedByAdminTxt },
  planSignin: { html: planSigninHtml, text: planSigninTxt },
  roadmapUpdate: { html: roadmapUpdateHtml, text: roadmapUpdateTxt },
  rsvpReconfirmRequest: { html: rsvpReconfirmRequestHtml, text: rsvpReconfirmRequestTxt },
  signinLink: { html: signinLinkHtml, text: signinLinkTxt },
  unreadChatDigest: { html: unreadChatDigestHtml, text: unreadChatDigestTxt },
  verifyEmail: { html: verifyEmailHtml, text: verifyEmailTxt },
};

export type TemplateBasename = keyof typeof TEMPLATES;

export type TemplateModel = Record<string, unknown>;

/** Shared vars merged into every render. Per-call model overrides win. */
function getBaseModel(): TemplateModel {
  return { year: new Date().getFullYear(), productName: "NewChums" };
}

/** Render the .txt template without HTML-escaping. Mustache's HTML escape
 *  is fine for the .html body (and the existing helpers already escape
 *  user content destined for triple-stache fields like `planCards`), but
 *  we never want HTML entities in the plain-text fallback. */
const PLAIN_TEXT_ESCAPE: (value: string) => string = (s) => s;

export type RenderedEmail = {
  html: string;
  text: string;
  subject: string;
};

/**
 * Render a template basename + model into final {html, text, subject}.
 * `subjectKey` defaults to the basename; pass an explicit value for
 * templates that have variants (e.g. confirmationRequestUser).
 */
export function renderEmail(
  basename: TemplateBasename,
  model: TemplateModel,
  subjectKey: SubjectKey = basename as unknown as SubjectKey,
): RenderedEmail {
  const tpl = TEMPLATES[basename];
  if (!tpl) throw new Error(`Unknown email template: ${basename}`);
  const subjectTemplate = SUBJECTS[subjectKey];
  if (!subjectTemplate) throw new Error(`Unknown subject key: ${subjectKey}`);

  const fullModel = { ...getBaseModel(), ...model };

  const html = Mustache.render(tpl.html, fullModel);
  const text = Mustache.render(tpl.text, fullModel, undefined, {
    escape: PLAIN_TEXT_ESCAPE,
  });
  const subject = Mustache.render(subjectTemplate, fullModel, undefined, {
    escape: PLAIN_TEXT_ESCAPE,
  });

  return { html, text, subject };
}
