/// Compile-time env config.
///
/// Default is production (`https://shopmodaire.com`) so any release build
/// (TestFlight / App Store / Play Store) works out of the box without a
/// dart-define. For LOCAL DEVELOPMENT against `npm run dev`, override at
/// launch:
///
///   flutter run --dart-define=API_BASE_URL=http://localhost:3000
///
/// iOS simulator: `localhost` resolves to the Mac's localhost.
/// Android emulator: `10.0.2.2` is the host machine, NOT `localhost`.
/// Physical device: use your Mac's LAN IP (System Settings → Network) or
///   just point at production and skip the local server.
class Env {
  const Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://shopmodaire.com',
  );

  static const String appVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '1.0.0',
  );
}
