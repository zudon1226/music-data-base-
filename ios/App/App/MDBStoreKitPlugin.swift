import Foundation
import Capacitor
import StoreKit

/**
 * StoreKit 2 bridge for MDB (product load + signed transaction export).
 * Purchases are blocked at the JS layer while public beta commerce is locked.
 */
@objc(MDBStoreKitPlugin)
public class MDBStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MDBStoreKitPlugin"
    public let jsName = "MDBStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStorefrontEnvironment", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
    ]

    @objc func getStorefrontEnvironment(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            Task {
                let env = AppStore.canMakePayments ? "available" : "unavailable"
                call.resolve(["canMakePayments": AppStore.canMakePayments, "status": env])
            }
            return
        }
        call.resolve(["canMakePayments": false, "status": "unsupported"])
    }

    @objc func loadProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds is required")
            return
        }
        if #available(iOS 15.0, *) {
            Task {
                do {
                    let products = try await Product.products(for: Set(ids))
                    let payload = products.map { product -> [String: Any] in
                        [
                            "id": product.id,
                            "displayName": product.displayName,
                            "description": product.description,
                            "type": String(describing: product.type),
                        ]
                    }
                    call.resolve(["products": payload])
                } catch {
                    call.reject("Failed to load products", nil, error)
                }
            }
            return
        }
        call.reject("StoreKit 2 requires iOS 15+")
    }

    @objc func purchaseProduct(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("productId is required")
            return
        }
        if call.getBool("commerceLocked") == true {
            call.resolve([
                "ok": false,
                "code": "COMMERCE_LOCKED",
                "error": "Purchases and Sales Coming at Full Launch.",
            ])
            return
        }
        if #available(iOS 15.0, *) {
            Task {
                do {
                    let products = try await Product.products(for: [productId])
                    guard let product = products.first else {
                        call.reject("Product unavailable")
                        return
                    }
                    let appAccountTokenString = call.getString("appAccountToken") ?? ""
                    var options: Set<Product.PurchaseOption> = []
                    if let token = UUID(uuidString: appAccountTokenString) {
                        options.insert(.appAccountToken(token))
                    }
                    let result = try await product.purchase(options: options)
                    switch result {
                    case .success(let verification):
                        let signed = verification.jwsRepresentation
                        switch verification {
                        case .verified(let transaction):
                            await transaction.finish()
                            call.resolve([
                                "ok": true,
                                "signedTransactionInfo": signed,
                                "transactionId": String(transaction.id),
                                "originalTransactionId": String(transaction.originalID),
                                "productId": transaction.productID,
                            ])
                        case .unverified(_, let error):
                            call.reject("Unverified transaction", nil, error)
                        }
                    case .userCancelled:
                        call.resolve(["ok": false, "code": "USER_CANCELLED"])
                    case .pending:
                        call.resolve(["ok": false, "code": "PENDING"])
                    @unknown default:
                        call.resolve(["ok": false, "code": "UNKNOWN"])
                    }
                } catch {
                    call.reject("Purchase failed", nil, error)
                }
            }
            return
        }
        call.reject("StoreKit 2 requires iOS 15+")
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            Task {
                var signedTransactions: [String] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified = result {
                        signedTransactions.append(result.jwsRepresentation)
                    }
                }
                call.resolve(["signedTransactionInfos": signedTransactions])
            }
            return
        }
        call.reject("StoreKit 2 requires iOS 15+")
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        restorePurchases(call)
    }
}
