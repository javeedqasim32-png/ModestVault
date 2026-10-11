import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app/app.dart';

/// Runs in a background isolate when a push arrives while the app is
/// terminated or backgrounded. Firebase must be initialized before any
/// Firebase API is touched here. iOS renders the banner straight from the
/// APNs payload, so there's nothing to display — this exists so data messages
/// don't crash and so FCM treats background delivery as wired up.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Every Jost / Cormorant weight the app uses is bundled under
  // assets/google_fonts/, so refuse to reach for fonts.gstatic.com. Left on,
  // google_fonts downloads at runtime and renders the iOS system font until
  // that lands — a visible flash on first launch and permanently wrong text
  // offline. Turning it off also makes a missing weight fail loudly in
  // development rather than silently working on a machine with a warm cache.
  GoogleFonts.config.allowRuntimeFetching = false;

  // Firebase powers push notifications. On iOS this reads
  // ios/Runner/GoogleService-Info.plist. Guarded so a platform that isn't
  // configured yet (e.g. Android before google-services.json is added) still
  // boots — it just runs without push.
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  } catch (e) {
    debugPrint('[push] Firebase init failed, continuing without push: $e');
  }

  runApp(const ProviderScope(child: ModaireApp()));
}
