import 'package:bezzo_mobile/features/demo/presentation/demo_showcase_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('buyer can complete a fully offline demo order', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(const DemoShowcaseApp());

    expect(
      find.text('DEMO MODE · Offline sample only · No real orders or payments'),
      findsOneWidget,
    );
    expect(find.text('Buyer demo sign-in'), findsOneWidget);
    await tester.tap(find.text('Continue as demo buyer'));
    await tester.pumpAndSettle();

    expect(find.text('Medicine boxes for your pharmacy'), findsOneWidget);
    expect(find.text('Paracetamol'), findsWidgets);
    expect(find.text('SEALED BOX'), findsWidgets);
    expect(
      find.textContaining(RegExp(r'tablet|strip', caseSensitive: false)),
      findsNothing,
    );

    await tester.tap(find.text('Add sealed box').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Basket').last);
    await tester.pumpAndSettle();

    expect(find.text('Paracetamol'), findsWidgets);
    expect(find.text('₹84'), findsWidgets);
    await tester.tap(find.text('Continue to demo checkout · ₹84'));
    await tester.pumpAndSettle();

    expect(find.text('Cash on delivery · simulation'), findsOneWidget);
    await tester.tap(find.text('Place demo COD order'));
    await tester.pumpAndSettle();
    expect(find.text('Demo order placed'), findsOneWidget);
    await tester.tap(find.text('View demo order'));
    await tester.pumpAndSettle();

    expect(find.text('Demo order history'), findsOneWidget);
    expect(find.text('DEMO-0001'), findsOneWidget);
    expect(find.textContaining('Confirmed (demo)'), findsOneWidget);

    await tester.tap(find.text('DEMO-0001'));
    await tester.pumpAndSettle();
    expect(find.text('Demo order status'), findsOneWidget);
    expect(find.text('Delivery pending (demo)'), findsOneWidget);
  });
}
