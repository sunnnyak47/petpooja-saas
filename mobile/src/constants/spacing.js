// Global spacing + sizing constants for MS-RM app
// All screens import from here for consistency

export const S = {
  // Padding
  pagePad:    20,    // horizontal page padding
  cardPad:    18,    // inside card padding
  sectionGap: 24,    // vertical gap between major sections
  itemGap:    14,    // gap between list items
  rowPad:     16,    // touchable row vertical padding

  // Border radius
  cardRadius:  16,   // all cards
  sheetRadius: 24,   // bottom sheets / modals (top corners)
  pillRadius:  999,  // chips, badges, status pills — fully round
  inputRadius: 12,   // text inputs
  btnRadius:   12,   // buttons
  badgeRadius: 999,  // small count badges

  // Shadows (shared objects)
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  heroShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 6,
  },
  sheetShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
  },

  // Touch targets
  minTouchSize: 44,  // Apple HIG minimum
};
