import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app/app.dart';

void main() {
  // Every Jost / Cormorant weight the app uses is bundled under
  // assets/google_fonts/, so refuse to reach for fonts.gstatic.com. Left on,
  // google_fonts downloads at runtime and renders the iOS system font until
  // that lands — a visible flash on first launch and permanently wrong text
  // offline. Turning it off also makes a missing weight fail loudly in
  // development rather than silently working on a machine with a warm cache.
  GoogleFonts.config.allowRuntimeFetching = false;

  runApp(const ProviderScope(child: ModaireApp()));
}
