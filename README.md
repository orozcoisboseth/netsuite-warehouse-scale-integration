# NetSuite Warehouse Receiving with Scale Integration

A SuiteScript 2.1 solution for receiving lot-numbered Purchase Orders using an external weighing scale.

The solution validates scanned lot numbers against the Purchase Order, retrieves the current weight from a configured scale, creates an Item Receipt, and stores the captured weight on the corresponding Inventory Number record.

---

## Features

- Receive lot-numbered Purchase Orders
- Barcode-based lot scanning
- Purchase Order lot validation
- External scale integration
- Configurable scale endpoints
- Automatic Item Receipt creation
- Store captured weight on Inventory Number records
- Role-based manual weight entry
- Modular SuiteScript 2.1 architecture

---

# Architecture

```
Purchase Order
      │
      ▼
User Event
      │
      ▼
Client Script
      │
      ▼
Suitelet
      │
      ├── PurchaseOrderService
      ├── ScaleService
      ├── MiddlewareService
      └── ItemReceiptService
```

---

# Project Structure

```
src/

├── clients/
│   ├── cs_receive_lots_redirect.js
│   └── cs_receive_lots.js
│
├── services/
│   ├── purchase_order_service.js
│   ├── scale_service.js
│   ├── middleware_service.js
│   └── item_receipt_service.js
│
├── suitelets/
│   └── sl_receive_lots.js
│
└── userevents/
    └── ue_receive_lots_button.js
```

---

# Receiving Process

1. Open a Purchase Order.
2. Click **Receive Lots**.
3. Select the warehouse location.
4. Select the desired scale.
5. Scan a lot barcode.
6. The system validates that the lot belongs to the Purchase Order.
7. The current weight is requested from the configured scale.
8. Repeat until all required lots have been captured.
9. Click **Save**.
10. The system creates an Item Receipt and stores the captured weight on each Inventory Number.

---

# Prerequisites

Before deploying the project, configure the following objects in NetSuite.

## Inventory Number Field

Create a custom numeric field on the **Inventory Number** record.

| Property | Value |
|----------|------|
| Label | Weight |
| Script ID | `custitemnumber_weight` |
| Type | Decimal Number |

If your account uses a different field ID, update the configuration inside:

```
services/item_receipt_service.js
```

```javascript
const CONFIG = {

    INVENTORY_NUMBER_WEIGHT_FIELD:
        'custitemnumber_weight'

};
```

---

## Scale Configuration Record

Create a custom record that stores the available scales.

Each record should contain at least:

- Name
- Middleware Endpoint
- Authorization Header

The default service expects fields similar to:

- Endpoint
- Authorization

These can be modified inside:

```
services/scale_service.js
```

---

## Middleware

The middleware must expose an endpoint capable of returning the current scale weight.

Expected response:

```json
[
    {
        "measurement": {
            "kg": 842.53
        }
    }
]
```

The response parser can be modified inside:

```
services/middleware_service.js
```

---

# Configuration

The project keeps environment-specific values isolated in configuration constants.

Examples:

```javascript
const CONFIG = {

    INVENTORY_NUMBER_WEIGHT_FIELD:
        'custitemnumber_weight'

};
```

---

# Technologies

- SuiteScript 2.1
- User Events
- Client Scripts
- Suitelets
- REST Integration
- Inventory Detail
- Lot Numbered Inventory
- External Scale Integration

---

# Security

Only authorized roles may manually enter lot weights.

All other users must obtain weights directly from the configured scale.

Allowed roles can be configured inside:

```
suitelets/sl_receive_lots.js
```

---

# Current Limitations

- Supports Lot Numbered Inventory items.
- Assumes one inventory assignment per received lot.
- Requires an external middleware for scale communication.
- Weight is stored in a custom Inventory Number field.
- Scale communication is synchronous.

---

# Customization

The project was intentionally designed to be generic.

The following components can be replaced without affecting the remaining architecture:

- Scale provider
- Middleware implementation
- Authorization mechanism
- Inventory Number weight field
- Scale configuration record

---

# Future Improvements

Possible enhancements include:

- Multiple scale providers
- Automatic scale detection
- Serial-number support
- Receiving history
- Weight tolerance validation
- Scale health monitoring
- Batch receiving
- Asynchronous weight capture

---

# License

MIT License
