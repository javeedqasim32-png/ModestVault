import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import 'auth_controller.dart';
import 'auth_storage.dart';
import 'signup_repository.dart';

/// Signup state machine, mirrors the 2-step web flow:
///
///   SignupIdle
///     ↓ startSignup(form) → 200 { email }
///   SignupPendingVerification(email)
///     ↓ verifyCode(code) → 200 { session }
///   [handoff to AuthController.setSession — state resets to SignupIdle]
///
/// Errors surface via the throwing methods; UI catches [ApiException] and
/// shows the message. The controller doesn't hold errors in state — the
/// screen owns the "last error banner" for that specific submit.
sealed class SignupState {
  const SignupState();
}

class SignupIdle extends SignupState {
  const SignupIdle();
}

class SignupSubmitting extends SignupState {
  const SignupSubmitting();
}

class SignupPendingVerification extends SignupState {
  const SignupPendingVerification(this.email);
  final String email;
}

class SignupVerifying extends SignupState {
  const SignupVerifying(this.email);
  final String email;
}

class SignupController extends Notifier<SignupState> {
  @override
  SignupState build() => const SignupIdle();

  Future<void> startSignup(SignUpForm form) async {
    state = const SignupSubmitting();
    try {
      final email = await ref.read(signupRepositoryProvider).startSignup(form);
      state = SignupPendingVerification(email);
    } on ApiException {
      state = const SignupIdle();
      rethrow;
    } catch (_) {
      state = const SignupIdle();
      rethrow;
    }
  }

  /// Verifies the 6-digit code, persists the returned session, and flips
  /// [authControllerProvider] to Authenticated so the router redirects to
  /// the home tab automatically.
  Future<void> verifyCode({required String code}) async {
    final current = state;
    if (current is! SignupPendingVerification) {
      throw StateError('verifyCode called without a pending verification.');
    }
    state = SignupVerifying(current.email);
    try {
      final session = await ref
          .read(signupRepositoryProvider)
          .verifyCode(email: current.email, code: code);
      await ref.read(authStorageProvider).writeSession(session);
      ref.read(authControllerProvider.notifier).setSession(session);
      state = const SignupIdle();
    } on ApiException {
      // Stay in the PendingVerification step so the user can re-enter the code.
      state = SignupPendingVerification(current.email);
      rethrow;
    } catch (_) {
      state = SignupPendingVerification(current.email);
      rethrow;
    }
  }

  Future<void> resendCode() async {
    final current = state;
    final email = current is SignupPendingVerification
        ? current.email
        : current is SignupVerifying
            ? current.email
            : null;
    if (email == null) {
      throw StateError('resendCode called without a pending verification.');
    }
    await ref.read(signupRepositoryProvider).resendCode(email: email);
  }

  /// Called by the details screen when the user backs out — keeps the state
  /// tree in sync with what's visible.
  void reset() {
    state = const SignupIdle();
  }
}

final signupControllerProvider =
    NotifierProvider<SignupController, SignupState>(SignupController.new);
