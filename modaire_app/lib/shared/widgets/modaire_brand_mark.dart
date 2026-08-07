import 'package:flutter/material.dart';

/// Modaire wordmark — the same `public/logo-v2.png` asset the website
/// ships in its Navbar. Centralized so every AppBar that should show
/// the brand (Home, Explore, Listing detail, etc.) renders the exact
/// same proportions; bump [height] if a screen needs a larger mark.
class ModaireBrandMark extends StatelessWidget {
  const ModaireBrandMark({super.key, this.height = 32});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/branding/modaire-logo.png',
      height: height,
      fit: BoxFit.contain,
    );
  }
}
