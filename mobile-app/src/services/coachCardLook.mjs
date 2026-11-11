// A coach's look on their card in the app's Coaches tab (owner, 2026-11-11: "make the coach cards look the
// same also on marketplace on app"), the twin of the website's Coaches card (marketplace.jsx mkCardLook,
// #2706). From the coach's public card (get_public_profile, read through ShapeProfiles.getPublicProfile):
//   · pal: their paper and accent as the kit paints them (bsCoachPagePalette), or the Climb's dark card
//     when they picked a climb background or a cover but no colours;
//   · wash: their climb background (bsClimbWash), laid over the card;
//   · cover / coverPos: their cover photo, held to their own media (bsProfileCover), at the spot they
//     dragged it to (bsLookPosition).
// A private card (can_view false), a sample, a listing with no account and a coach who set none of these
// have no look: the card stays as the directory draws it.
import { bsCoachPagePalette, bsClimbWash } from './coachPagePalette.mjs';
import { bsProfileLook, bsProfileCover, bsLookPosition } from './profileCustom.mjs';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// The cover's three stops, as the website's card (MK_FOCUS) and the coach's stage.
export const BS_CARD_FOCUS = Object.freeze({ top: 'center 22%', center: 'center 50%', bottom: 'center 80%' });

/** The Climb's dark card in a role's colours, for a coach with a wash or a cover and no colours. */
export function bsClimbCardPalette(role = 'trainer') {
  const nutri = role === 'nutritionist';
  return Object.freeze({
    isLight: false, paperKey: null, accentKey: null,
    PAPER: '#0a0f17', PAPER2: '#0f1722', BG: '#06090f', BG_RGB: '6,9,15', DEEP: '#070b11', DEEP_RGB: '7,11,17',
    INK: '#eef3f0', inkRGB: '238,243,240', INK_SOFT: '#bfc6c3', INK_MUTED: '#9aa3a0',
    ACCENT: nutri ? '#d8a23a' : '#34d6c5', ON_ACCENT: '#0b0d0c',
    CTA: nutri ? '#d8a23a' : '#c0533b', ON_CTA: nutri ? '#16110a' : '#ffffff', CTA_TEXT: nutri ? '#e6c373' : '#ec8a70',
  });
}

/**
 * The card's look from a public card (`row`: { can_view, custom }), the coach's role and account id, or null.
 */
export function bsCoachCardLook(row, role = 'trainer', ownerId = null) {
  if (!isObj(row) || row.can_view === false || !isObj(row.custom) || !ownerId) return null;
  const custom = row.custom;
  const look = bsProfileLook(custom.look);
  const picked = look ? bsCoachPagePalette(look, role) : null;
  const wash = bsClimbWash(custom.climbBg);
  const cov = bsProfileCover(custom.cover, ownerId);
  const cover = cov && typeof cov.image === 'string' ? cov.image : null;
  if (!picked && !wash && !cover) return null;
  return {
    pal: picked || bsClimbCardPalette(role),
    picked: !!picked,
    wash,
    cover,
    coverPos: cover ? bsLookPosition(look, BS_CARD_FOCUS) : null,
  };
}
