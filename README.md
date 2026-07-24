# NetSuite Warehouse Scale Integration

A NetSuite warehouse receiving solution that streamlines the receipt of lot-controlled inventory by capturing the weight of each lot directly from industrial scales.

The solution extends the standard Purchase Order receiving process with a custom Suitelet that validates scanned lot barcodes, retrieves live weight data through a middleware layer, and creates one or multiple Item Fulfillments based on the processed lots.

---

## Features

- Purchase Order receiving workflow
- Lot-by-lot receiving
- Partial or complete Purchase Order receiving
- Barcode scanning
- Live weight capture from industrial scales
- Manual weight entry for authorized users
- Role-based permissions
- Purchase Order lot validation
- Automatic Item Fulfillment creation
- SuiteScript 2.1

---

## Architecture

```text
Purchase Order
        │
        ▼
User Event
(Adds custom button)
        │
        ▼
Client Script
(Redirects to Suitelet)
        │
        ▼
Receiving Suitelet
        │
        ├──────────────┐
        │              │
Barcode Scan     Manual Weight
        │              │
        ▼              │
Lot Validation         │
        │              │
        ▼              │
Middleware API         │
(Currently PrintNode)  │
        │              │
        ▼              │
Industrial Scale       │
        │              │
        └──────┬───────┘
               ▼
      Weight Assigned
               │
               ▼
Save
               │
               ▼
Item Fulfillment
```

---

## Workflow

1. A custom button is added to the Purchase Order through a User Event script.

2. Clicking the button opens a Suitelet displaying all pending lots associated with the Purchase Order.

3. The operator selects:
   - Warehouse Location
   - Scale

4. The operator scans the barcode attached to a physical lot.

5. The Suitelet validates that the scanned lot:
   - Exists in the current Purchase Order.
   - Has not already been processed.

6. If the validation succeeds:
   - Authorized users may enter the weight manually.
   - Standard warehouse users retrieve the weight directly from the selected industrial scale.

7. The middleware requests the current weight from the selected scale and returns it to NetSuite.

8. The captured weight is assigned to the scanned lot.

9. Steps 4–8 can be repeated for as many lots as needed during the current receiving session.

10. When the user clicks **Save**, an Item Fulfillment is automatically created containing only the processed lots.

11. Additional Item Fulfillments can be created later by repeating the process for the remaining lots.

---

## Role-Based Security

| User Type | Manual Weight | Scale Reading |
|------------|:-------------:|:-------------:|
| Warehouse Operator | ❌ | ✅ |
| Authorized User | ✅ | ✅ |

---

## Why a Middleware Layer?

Industrial scales communicate through serial (COM) ports, which cannot be accessed directly from NetSuite.

The current implementation uses **PrintNode** as the middleware layer because it provides secure access to locally connected devices without requiring the development and maintenance of a custom Windows service or IIS-hosted API.

The architecture is intentionally decoupled from the middleware implementation. If business requirements change, PrintNode can be replaced by another solution (such as a custom REST API or Windows service) without affecting the overall NetSuite workflow.

---

## Project Structure

```text
src/

├── userevents/
│   └── Adds the custom Purchase Order button
│
├── clients/
│   └── Redirects users to the Suitelet
│
├── suitelets/
│   └── Receiving interface
│
├── services/
│   ├── Scale Service
│   ├── Middleware Service
│   ├── Lot Validation
│   └── Item Fulfillment Creation
│
└── lib/
    └── Shared utilities
```

---

## Technologies

- Oracle NetSuite
- SuiteScript 2.1
- User Event Scripts
- Client Scripts
- Suitelets
- REST APIs
- PrintNode API
- Barcode Scanners
- Industrial Serial (COM) Scales

---

## Business Benefits

- Eliminates manual transcription errors during receiving.
- Validates scanned lots before processing.
- Supports both manual and automated weight capture.
- Reduces warehouse receiving time.
- Supports partial Purchase Order receipts.
- Automatically generates Item Fulfillments from processed lots.

---


## Disclaimer

This repository demonstrates the architecture and implementation approach of a warehouse receiving solution for Oracle NetSuite.

Company-specific business rules, proprietary configurations, credentials, and sensitive information have been removed before publication.
