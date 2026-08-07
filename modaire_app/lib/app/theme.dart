import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class ModaireColors {
  static const Color espresso = Color(0xFF5F4437);
  static const Color cream = Color(0xFFFBF8F4);
  // #2F2925 mirrors the web's canonical text-primary token (see
  // globals.css / tileTextPrimary below). Previously #2F241F — 2 hex-code
  // points warmer than web, which read faintly reddish next to the web
  // pages when a user hopped between surfaces.
  static const Color espressoText = Color(0xFF2F2925);
  static const Color muted = Color(0xFFEBE2DC);
  static const Color border = Color(0xFFDDD1CA);
  static const Color secondary = Color(0xFFEFE7E2);
  static const Color accent = Color(0xFFE3D2C4);
  static const Color warm = Color(0xFFE5D5CA);
  static const Color destructive = Color(0xFFDC2626);

  // Browse / tile palette. Aligned with the website's `--background`
  // token (#faf6f2 — see src/app/globals.css). The web overrides this
  // to `#f4efea` on a few pages but its body gradient softens that to
  // visually read closer to #faf6f2; we use the lighter token directly
  // so the mobile app matches the perceived page tone end-to-end.
  static const Color browsePageBg = Color(0xFFFBF8F4);
  static const Color tileBg = Color(0xFFFFFFFF);
  static const Color tileBorder = Color(0xFFECE3DC);
  static const Color tileImageBg = Color(0xFFFAF8F6);
  static const Color tileTextPrimary = Color(0xFF2F2925);
  static const Color tileTextSubtle = Color(0xFF8A7667);
  // "% Off" pill on discounted tiles — #4a3328 on the web mobile tile.
  static const Color promoBadgeBg = Color(0xFF4A3328);

  // Listing detail palette — matches src/app/listings/[id]/page.tsx.
  static const Color detailPageBg = Color(0xFFFBF8F4);
  static const Color detailPrice = Color(0xFF4A3328);
  static const Color sellerCardBg = Color(0xFFE8DDD1);
  static const Color sellerAvatarBg = Color(0xFFD2BAA3);
  static const Color pillBg = Color(0xFFFBF8F5);
  static const Color pillBorder = Color(0xFFDDD3CB);

  // Bottom nav palette — matches src/components/layout/MobileBottomNav.tsx.
  // navInactive darkened from #A39082 for readability against the cream pill.
  // Bottom nav — values taken from src/components/layout/MobileBottomNav.tsx.
  // The website uses a *different* tone for the active icon (#3d2718) than the
  // active label (#2f2925), and one shared muted tone for both when inactive.
  static const Color navActive = Color(0xFF3D2718);
  static const Color navLabelActive = Color(0xFF2F2925);
  static const Color navInactive = Color(0xFFA39082);
  static const Color sellPillBg = Color(0xFFEFE6DD);
  static const Color sellPillBgActive = Color(0xFFB89D82);
  static const Color sellPillIcon = Color(0xFF4A3328);
  static const Color sellPillIconActive = Color(0xFF3D2718);
}

ThemeData buildModaireTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: ModaireColors.espresso,
    primary: ModaireColors.espresso,
    onPrimary: ModaireColors.cream,
    secondary: ModaireColors.accent,
    onSecondary: ModaireColors.espressoText,
    surface: ModaireColors.cream,
    onSurface: ModaireColors.espressoText,
    error: ModaireColors.destructive,
    brightness: Brightness.light,
  );

  final baseSans = GoogleFonts.jostTextTheme();
  final textTheme = baseSans.copyWith(
    displayLarge: GoogleFonts.cormorantGaramond(
      fontSize: 57,
      fontWeight: FontWeight.w500,
      color: ModaireColors.espressoText,
    ),
    displayMedium: GoogleFonts.cormorantGaramond(
      fontSize: 45,
      fontWeight: FontWeight.w500,
      color: ModaireColors.espressoText,
    ),
    displaySmall: GoogleFonts.cormorantGaramond(
      fontSize: 36,
      fontWeight: FontWeight.w500,
      color: ModaireColors.espressoText,
    ),
    headlineLarge: GoogleFonts.cormorantGaramond(
      fontSize: 32,
      fontWeight: FontWeight.w500,
      color: ModaireColors.espressoText,
    ),
    headlineMedium: GoogleFonts.cormorantGaramond(
      fontSize: 28,
      fontWeight: FontWeight.w500,
      color: ModaireColors.espressoText,
    ),
    headlineSmall: GoogleFonts.cormorantGaramond(
      fontSize: 24,
      fontWeight: FontWeight.w500,
      color: ModaireColors.espressoText,
    ),
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    textTheme: textTheme,
    scaffoldBackgroundColor: ModaireColors.cream,
    canvasColor: ModaireColors.cream,
    appBarTheme: const AppBarTheme(
      backgroundColor: ModaireColors.cream,
      foregroundColor: ModaireColors.espressoText,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
    ),
    dividerTheme: const DividerThemeData(
      color: ModaireColors.border,
      space: 1,
      thickness: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: ModaireColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: ModaireColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: ModaireColors.espresso, width: 1.5),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      // Pill shape (StadiumBorder) mirrors the web's `rounded-full`
      // button convention. Previously a 10px RoundedRectangleBorder which
      // read as Material-generic next to the editorial-boutique pill
      // buttons users see on shopmodaire.com. Tighter letter-spacing +
      // uppercase-ish weight matches web's CTA lettering.
      style: ElevatedButton.styleFrom(
        backgroundColor: ModaireColors.espresso,
        foregroundColor: ModaireColors.cream,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
        shape: const StadiumBorder(),
        textStyle: GoogleFonts.jost(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.4,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: ModaireColors.espresso,
      ),
    ),
  );
}
