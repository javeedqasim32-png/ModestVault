import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';

/// Shown for the brief moment between app start and the AuthController
/// finishing its async hydration from secure storage.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Modaire',
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 56,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.espresso,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 32),
              const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: ModaireColors.espresso,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
