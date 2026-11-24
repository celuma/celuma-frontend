export const tokens = {
    // Layout
    radius: 14,
    gap: 12,
    contentPadding: 24,
    cardPadding: 24,
    maxWidth: 1400,
    
    // Colors
    bg: "#fbf6ec",
    cardBg: "#fff",
    primary: "#49b6ad",
    accent: "#49b6ad",
    secondary: "#F98D84",      // Logo secondary (salmon)
    secondaryTint: "#ffeeec",
    textPrimary: "#0d1b2a",
    textSecondary: "#6b7280",
    
    // Shadows
    shadow: "0 10px 20px rgba(0,0,0,.08), 0 6px 6px rgba(0,0,0,.06)",
    
    // Error states
    errorBg: "#fff2f0",
    errorBorder: "#ffccc7",
    errorText: "#a8071a",
    
    // Typography
    titleFont: "'Baloo 2', system-ui, sans-serif",
    textFont: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    
    // Title sizes (consistent across pages)
    titleSize: 24,          // Main page title
    titleWeight: 800,
    subtitleSize: 14,       // Subtitle under title
    cardTitleSize: 20,      // Card section titles
};

/**
 * The centred column of a list page (page header + table card). Céluma 1.5 (#69 review):
 * a grid track's minimum is its content's width, and `CelumaTable` lays a wide table out at
 * `max-content`, so a long row used to widen the whole column and push the page header and
 * its main action past the viewport. `minmax(0, 1fr)` and `minWidth: 0` keep the column at
 * the available width; the table then scrolls inside its own region.
 */
export const listPageColumnStyle: React.CSSProperties = {
    maxWidth: tokens.maxWidth,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    minWidth: 0,
    gap: tokens.gap,
};

// Consistent card title style for use with Ant Design Card
export const cardTitleStyle: React.CSSProperties = {
    fontFamily: tokens.titleFont,
    fontSize: tokens.titleSize,
    fontWeight: tokens.titleWeight,
    color: tokens.textPrimary,
};

// Consistent page title style
export const pageTitleStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: tokens.titleFont,
    fontSize: tokens.titleSize,
    fontWeight: tokens.titleWeight,
    color: tokens.textPrimary,
};

// Consistent subtitle style
export const subtitleStyle: React.CSSProperties = {
    margin: "8px 0 0 0",
    color: tokens.textSecondary,
    fontSize: tokens.subtitleSize,
};

// Consistent card style for Ant Design Card component
export const cardStyle: React.CSSProperties = {
    borderRadius: tokens.radius,
    boxShadow: tokens.shadow,
    background: tokens.cardBg,
};
