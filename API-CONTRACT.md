# API Contract - Wallet/Deposit MVP

## Conventions

- Base URL: `/`
- Content type: `application/json`
- Timestamps: ISO 8601 UTC strings, for example `"2026-08-27T12:30:00Z"`
- Money amounts: decimal strings, for example `"10000.00"`
- Authentication: `Authorization: Bearer <JWT>`
- Token scopes:
  - Admin endpoints require an admin token with scope `"admin"`.
  - Customer endpoints require a customer token with scope `"customer"`.
- Error response shape:

```json
{
  "type": "object",
  "required": ["error"],
  "properties": {
    "error": {
      "type": "object",
      "required": ["code", "message"],
      "properties": {
        "code": { "type": "string" },
        "message": { "type": "string" },
        "details": { "type": "object" }
      }
    }
  }
}
```

## Shared Schemas

### Customer

```json
{
  "type": "object",
  "required": ["id", "full_name", "phone_number", "national_id", "status", "created_at"],
  "properties": {
    "id": { "type": "string" },
    "full_name": { "type": "string" },
    "phone_number": { "type": "string" },
    "national_id": { "type": "string" },
    "status": { "type": "string", "enum": ["pending", "active", "blocked"] },
    "created_at": { "type": "string", "format": "date-time" }
  }
}
```

### Wallet

```json
{
  "type": "object",
  "required": ["id", "customer_id", "balance", "updated_at"],
  "properties": {
    "id": { "type": "string" },
    "customer_id": { "type": "string" },
    "balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

### Transaction

```json
{
  "type": "object",
  "required": [
    "id",
    "transaction_ref",
    "customer_id",
    "type",
    "amount",
    "previous_balance",
    "new_balance",
    "status",
    "created_by_admin_id",
    "otp_verified",
    "created_at"
  ],
  "properties": {
    "id": { "type": "string" },
    "transaction_ref": { "type": "string" },
    "customer_id": { "type": "string" },
    "type": { "type": "string", "enum": ["DEPOSIT", "WITHDRAWAL"] },
    "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
    "previous_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
    "new_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
    "status": { "type": "string", "enum": ["pending", "success", "failed"] },
    "created_by_admin_id": { "type": ["string", "null"] },
    "otp_verified": { "type": "boolean" },
    "created_at": { "type": "string", "format": "date-time" }
  }
}
```

### Notification

```json
{
  "type": "object",
  "required": ["id", "customer_id", "title", "body", "is_read", "created_at"],
  "properties": {
    "id": { "type": "string" },
    "customer_id": { "type": "string" },
    "title": { "type": "string" },
    "body": { "type": "string" },
    "is_read": { "type": "boolean" },
    "created_at": { "type": "string", "format": "date-time" }
  }
}
```

### Pagination

```json
{
  "type": "object",
  "required": ["page", "limit", "total", "total_pages"],
  "properties": {
    "page": { "type": "integer", "minimum": 1 },
    "limit": { "type": "integer", "minimum": 1 },
    "total": { "type": "integer", "minimum": 0 },
    "total_pages": { "type": "integer", "minimum": 0 }
  }
}
```

## Endpoints

## POST /admin/login

Authenticates an admin and returns an admin-scoped JWT.

Auth: none

Request body:

```json
{
  "type": "object",
  "required": ["phone_number", "pin"],
  "properties": {
    "phone_number": { "type": "string" },
    "pin": { "type": "string", "pattern": "^\\d{4,6}$" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["token", "token_type", "scope", "admin"],
  "properties": {
    "token": { "type": "string" },
    "token_type": { "type": "string", "enum": ["Bearer"] },
    "scope": { "type": "string", "enum": ["admin"] },
    "admin": {
      "type": "object",
      "required": ["id", "phone_number"],
      "properties": {
        "id": { "type": "string" },
        "phone_number": { "type": "string" },
        "full_name": { "type": "string" }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `401 INVALID_CREDENTIALS`
- `403 ADMIN_BLOCKED`
- `500 INTERNAL_SERVER_ERROR`

## POST /customer/login

Authenticates an active customer and returns a customer-scoped JWT.

Auth: none

Request body:

```json
{
  "type": "object",
  "required": ["phone_number", "pin"],
  "properties": {
    "phone_number": { "type": "string" },
    "pin": { "type": "string", "pattern": "^\\d{4,6}$" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["token", "token_type", "scope", "customer"],
  "properties": {
    "token": { "type": "string" },
    "token_type": { "type": "string", "enum": ["Bearer"] },
    "scope": { "type": "string", "enum": ["customer"] },
    "customer": {
      "allOf": [
        { "$ref": "#/Shared Schemas/Customer" }
      ]
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `400 PIN_NOT_SET`
- `401 INVALID_CREDENTIALS`
- `403 CUSTOMER_PENDING_VERIFICATION`
- `403 CUSTOMER_BLOCKED`
- `500 INTERNAL_SERVER_ERROR`

## POST /customers

Registers a customer, creates a pending customer record, creates an empty wallet, and issues a registration OTP.

Auth: admin

Request body:

```json
{
  "type": "object",
  "required": ["full_name", "phone_number", "national_id"],
  "properties": {
    "full_name": { "type": "string", "minLength": 1 },
    "phone_number": { "type": "string" },
    "national_id": { "type": "string" },
    "pin": { "type": "string", "pattern": "^\\d{4,6}$" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["customer", "wallet", "otp"],
  "properties": {
    "customer": {
      "type": "object",
      "required": ["id", "full_name", "phone_number", "national_id", "status", "created_at"],
      "properties": {
        "id": { "type": "string" },
        "full_name": { "type": "string" },
        "phone_number": { "type": "string" },
        "national_id": { "type": "string" },
        "status": { "type": "string", "enum": ["pending"] },
        "created_at": { "type": "string", "format": "date-time" }
      }
    },
    "wallet": {
      "type": "object",
      "required": ["id", "customer_id", "balance", "updated_at"],
      "properties": {
        "id": { "type": "string" },
        "customer_id": { "type": "string" },
        "balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "updated_at": { "type": "string", "format": "date-time" }
      }
    },
    "otp": {
      "type": "object",
      "required": ["purpose", "expires_at"],
      "properties": {
        "purpose": { "type": "string", "enum": ["REGISTRATION"] },
        "expires_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `409 PHONE_NUMBER_ALREADY_EXISTS`
- `409 NATIONAL_ID_ALREADY_EXISTS`
- `500 INTERNAL_SERVER_ERROR`

## POST /customers/:id/set-pin

Sets or resets a customer's PIN. The raw PIN is never returned and only a bcrypt hash is stored.

Auth: admin

Path params:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" }
  }
}
```

Request body:

```json
{
  "type": "object",
  "required": ["pin"],
  "properties": {
    "pin": { "type": "string", "pattern": "^\\d{4,6}$" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["customer"],
  "properties": {
    "customer": {
      "type": "object",
      "required": ["id", "full_name", "phone_number", "national_id", "status", "created_at"],
      "properties": {
        "id": { "type": "string" },
        "full_name": { "type": "string" },
        "phone_number": { "type": "string" },
        "national_id": { "type": "string" },
        "status": { "type": "string", "enum": ["pending", "active", "blocked"] },
        "created_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 CUSTOMER_NOT_FOUND`
- `500 INTERNAL_SERVER_ERROR`

## POST /customers/:id/verify-otp

Verifies a registration OTP and activates the customer.

Auth: admin

Path params:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" }
  }
}
```

Request body:

```json
{
  "type": "object",
  "required": ["code"],
  "properties": {
    "code": { "type": "string" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["customer"],
  "properties": {
    "customer": {
      "type": "object",
      "required": ["id", "full_name", "phone_number", "national_id", "status", "created_at"],
      "properties": {
        "id": { "type": "string" },
        "full_name": { "type": "string" },
        "phone_number": { "type": "string" },
        "national_id": { "type": "string" },
        "status": { "type": "string", "enum": ["active"] },
        "created_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `400 OTP_INVALID`
- `400 OTP_EXPIRED`
- `404 CUSTOMER_NOT_FOUND`
- `409 CUSTOMER_ALREADY_VERIFIED`
- `500 INTERNAL_SERVER_ERROR`

## GET /customers

Lists customers with optional search and status filtering.

Auth: admin

Query params:

```json
{
  "type": "object",
  "properties": {
    "search": {
      "type": "string",
      "description": "Matches full_name, phone_number, or national_id."
    },
    "status": {
      "type": "string",
      "enum": ["pending", "active", "blocked"]
    },
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20
    }
  }
}
```

Request body: none

Response body:

```json
{
  "type": "object",
  "required": ["data", "pagination"],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "full_name", "phone_number", "national_id", "status", "created_at", "wallet"],
        "properties": {
          "id": { "type": "string" },
          "full_name": { "type": "string" },
          "phone_number": { "type": "string" },
          "national_id": { "type": "string" },
          "status": { "type": "string", "enum": ["pending", "active", "blocked"] },
          "created_at": { "type": "string", "format": "date-time" },
          "wallet": {
            "type": "object",
            "required": ["id", "balance", "updated_at"],
            "properties": {
              "id": { "type": "string" },
              "balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
              "updated_at": { "type": "string", "format": "date-time" }
            }
          }
        }
      }
    },
    "pagination": {
      "type": "object",
      "required": ["page", "limit", "total", "total_pages"],
      "properties": {
        "page": { "type": "integer", "minimum": 1 },
        "limit": { "type": "integer", "minimum": 1 },
        "total": { "type": "integer", "minimum": 0 },
        "total_pages": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `500 INTERNAL_SERVER_ERROR`

## GET /customers/:id

Gets a customer profile and wallet by customer ID.

Auth: admin

Path params:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" }
  }
}
```

Request body: none

Response body:

```json
{
  "type": "object",
  "required": ["customer", "wallet"],
  "properties": {
    "customer": {
      "type": "object",
      "required": ["id", "full_name", "phone_number", "national_id", "status", "created_at"],
      "properties": {
        "id": { "type": "string" },
        "full_name": { "type": "string" },
        "phone_number": { "type": "string" },
        "national_id": { "type": "string" },
        "status": { "type": "string", "enum": ["pending", "active", "blocked"] },
        "created_at": { "type": "string", "format": "date-time" }
      }
    },
    "wallet": {
      "type": "object",
      "required": ["id", "customer_id", "balance", "updated_at"],
      "properties": {
        "id": { "type": "string" },
        "customer_id": { "type": "string" },
        "balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "updated_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 CUSTOMER_NOT_FOUND`
- `500 INTERNAL_SERVER_ERROR`

## PATCH /customers/:id/status

Updates a customer's status.

Auth: admin

Path params:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" }
  }
}
```

Request body:

```json
{
  "type": "object",
  "required": ["status"],
  "properties": {
    "status": { "type": "string", "enum": ["pending", "active", "blocked"] },
    "reason": { "type": "string" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["customer"],
  "properties": {
    "customer": {
      "type": "object",
      "required": ["id", "full_name", "phone_number", "national_id", "status", "created_at"],
      "properties": {
        "id": { "type": "string" },
        "full_name": { "type": "string" },
        "phone_number": { "type": "string" },
        "national_id": { "type": "string" },
        "status": { "type": "string", "enum": ["pending", "active", "blocked"] },
        "created_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 CUSTOMER_NOT_FOUND`
- `409 INVALID_STATUS_TRANSITION`
- `500 INTERNAL_SERVER_ERROR`

## POST /customers/:id/deposit

Creates a successful deposit transaction and increases the customer's wallet balance.

Auth: admin

Path params:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" }
  }
}
```

Request body:

```json
{
  "type": "object",
  "required": ["amount"],
  "properties": {
    "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
    "note": { "type": "string" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["transaction", "wallet"],
  "properties": {
    "transaction": {
      "type": "object",
      "required": [
        "id",
        "transaction_ref",
        "customer_id",
        "type",
        "amount",
        "previous_balance",
        "new_balance",
        "status",
        "created_by_admin_id",
        "otp_verified",
        "created_at"
      ],
      "properties": {
        "id": { "type": "string" },
        "transaction_ref": { "type": "string" },
        "customer_id": { "type": "string" },
        "type": { "type": "string", "enum": ["DEPOSIT"] },
        "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "previous_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "new_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "status": { "type": "string", "enum": ["success"] },
        "created_by_admin_id": { "type": "string" },
        "otp_verified": { "type": "boolean", "enum": [false] },
        "created_at": { "type": "string", "format": "date-time" }
      }
    },
    "wallet": {
      "type": "object",
      "required": ["id", "customer_id", "balance", "updated_at"],
      "properties": {
        "id": { "type": "string" },
        "customer_id": { "type": "string" },
        "balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "updated_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `400 INVALID_AMOUNT`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `403 CUSTOMER_NOT_ACTIVE`
- `404 CUSTOMER_NOT_FOUND`
- `500 INTERNAL_SERVER_ERROR`

## POST /customers/:id/withdraw/request-otp

Creates a withdrawal OTP for the customer.

Auth: admin

Path params:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" }
  }
}
```

Request body:

```json
{
  "type": "object",
  "required": ["amount"],
  "properties": {
    "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["otp"],
  "properties": {
    "otp": {
      "type": "object",
      "required": ["purpose", "expires_at"],
      "properties": {
        "purpose": { "type": "string", "enum": ["WITHDRAWAL"] },
        "expires_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `400 INVALID_AMOUNT`
- `400 INSUFFICIENT_BALANCE`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `403 CUSTOMER_NOT_ACTIVE`
- `404 CUSTOMER_NOT_FOUND`
- `429 OTP_RATE_LIMITED`
- `500 INTERNAL_SERVER_ERROR`

## POST /customers/:id/withdraw/confirm

Verifies the withdrawal OTP, creates a successful withdrawal transaction, and decreases the customer's wallet balance.

Auth: admin

Path params:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" }
  }
}
```

Request body:

```json
{
  "type": "object",
  "required": ["amount", "code"],
  "properties": {
    "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
    "code": { "type": "string" },
    "note": { "type": "string" }
  }
}
```

Response body:

```json
{
  "type": "object",
  "required": ["transaction", "wallet"],
  "properties": {
    "transaction": {
      "type": "object",
      "required": [
        "id",
        "transaction_ref",
        "customer_id",
        "type",
        "amount",
        "previous_balance",
        "new_balance",
        "status",
        "created_by_admin_id",
        "otp_verified",
        "created_at"
      ],
      "properties": {
        "id": { "type": "string" },
        "transaction_ref": { "type": "string" },
        "customer_id": { "type": "string" },
        "type": { "type": "string", "enum": ["WITHDRAWAL"] },
        "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "previous_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "new_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "status": { "type": "string", "enum": ["success"] },
        "created_by_admin_id": { "type": "string" },
        "otp_verified": { "type": "boolean", "enum": [true] },
        "created_at": { "type": "string", "format": "date-time" }
      }
    },
    "wallet": {
      "type": "object",
      "required": ["id", "customer_id", "balance", "updated_at"],
      "properties": {
        "id": { "type": "string" },
        "customer_id": { "type": "string" },
        "balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "updated_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `400 INVALID_AMOUNT`
- `400 INSUFFICIENT_BALANCE`
- `400 OTP_INVALID`
- `400 OTP_EXPIRED`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `403 CUSTOMER_NOT_ACTIVE`
- `404 CUSTOMER_NOT_FOUND`
- `409 OTP_ALREADY_VERIFIED`
- `500 INTERNAL_SERVER_ERROR`

## GET /customers/:id/transactions

Lists transactions for a customer.

Auth: admin

Path params:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" }
  }
}
```

Query params:

```json
{
  "type": "object",
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20
    }
  }
}
```

Request body: none

Response body:

```json
{
  "type": "object",
  "required": ["data", "pagination"],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "transaction_ref",
          "customer_id",
          "type",
          "amount",
          "previous_balance",
          "new_balance",
          "status",
          "created_by_admin_id",
          "otp_verified",
          "created_at"
        ],
        "properties": {
          "id": { "type": "string" },
          "transaction_ref": { "type": "string" },
          "customer_id": { "type": "string" },
          "type": { "type": "string", "enum": ["DEPOSIT", "WITHDRAWAL"] },
          "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
          "previous_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
          "new_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
          "status": { "type": "string", "enum": ["pending", "success", "failed"] },
          "created_by_admin_id": { "type": ["string", "null"] },
          "otp_verified": { "type": "boolean" },
          "created_at": { "type": "string", "format": "date-time" }
        }
      }
    },
    "pagination": {
      "type": "object",
      "required": ["page", "limit", "total", "total_pages"],
      "properties": {
        "page": { "type": "integer", "minimum": 1 },
        "limit": { "type": "integer", "minimum": 1 },
        "total": { "type": "integer", "minimum": 0 },
        "total_pages": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 CUSTOMER_NOT_FOUND`
- `500 INTERNAL_SERVER_ERROR`

## GET /admin/dashboard

Returns admin dashboard metrics.

Auth: admin

Request body: none

Response body:

```json
{
  "type": "object",
  "required": [
    "customers",
    "wallets",
    "transactions"
  ],
  "properties": {
    "customers": {
      "type": "object",
      "required": ["total", "pending", "active", "blocked"],
      "properties": {
        "total": { "type": "integer", "minimum": 0 },
        "pending": { "type": "integer", "minimum": 0 },
        "active": { "type": "integer", "minimum": 0 },
        "blocked": { "type": "integer", "minimum": 0 }
      }
    },
    "wallets": {
      "type": "object",
      "required": ["total_balance"],
      "properties": {
        "total_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" }
      }
    },
    "transactions": {
      "type": "object",
      "required": [
        "total_count",
        "deposit_count",
        "withdrawal_count",
        "total_deposited",
        "total_withdrawn",
        "recent"
      ],
      "properties": {
        "total_count": { "type": "integer", "minimum": 0 },
        "deposit_count": { "type": "integer", "minimum": 0 },
        "withdrawal_count": { "type": "integer", "minimum": 0 },
        "total_deposited": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "total_withdrawn": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "recent": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "id",
              "transaction_ref",
              "customer_id",
              "type",
              "amount",
              "previous_balance",
              "new_balance",
              "status",
              "created_by_admin_id",
              "otp_verified",
              "created_at"
            ],
            "properties": {
              "id": { "type": "string" },
              "transaction_ref": { "type": "string" },
              "customer_id": { "type": "string" },
              "type": { "type": "string", "enum": ["DEPOSIT", "WITHDRAWAL"] },
              "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
              "previous_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
              "new_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
              "status": { "type": "string", "enum": ["pending", "success", "failed"] },
              "created_by_admin_id": { "type": ["string", "null"] },
              "otp_verified": { "type": "boolean" },
              "created_at": { "type": "string", "format": "date-time" }
            }
          }
        }
      }
    }
  }
}
```

Possible error codes:

- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `500 INTERNAL_SERVER_ERROR`

## GET /me

Returns the authenticated customer's profile and wallet.

Auth: customer

Request body: none

Response body:

```json
{
  "type": "object",
  "required": ["customer", "wallet"],
  "properties": {
    "customer": {
      "type": "object",
      "required": ["id", "full_name", "phone_number", "national_id", "status", "created_at"],
      "properties": {
        "id": { "type": "string" },
        "full_name": { "type": "string" },
        "phone_number": { "type": "string" },
        "national_id": { "type": "string" },
        "status": { "type": "string", "enum": ["pending", "active", "blocked"] },
        "created_at": { "type": "string", "format": "date-time" }
      }
    },
    "wallet": {
      "type": "object",
      "required": ["id", "customer_id", "balance", "updated_at"],
      "properties": {
        "id": { "type": "string" },
        "customer_id": { "type": "string" },
        "balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
        "updated_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

Possible error codes:

- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 CUSTOMER_NOT_FOUND`
- `500 INTERNAL_SERVER_ERROR`

## GET /me/transactions

Lists transactions for the authenticated customer.

Auth: customer

Query params:

```json
{
  "type": "object",
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20
    }
  }
}
```

Request body: none

Response body:

```json
{
  "type": "object",
  "required": ["data", "pagination"],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "transaction_ref",
          "customer_id",
          "type",
          "amount",
          "previous_balance",
          "new_balance",
          "status",
          "created_by_admin_id",
          "otp_verified",
          "created_at"
        ],
        "properties": {
          "id": { "type": "string" },
          "transaction_ref": { "type": "string" },
          "customer_id": { "type": "string" },
          "type": { "type": "string", "enum": ["DEPOSIT", "WITHDRAWAL"] },
          "amount": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
          "previous_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
          "new_balance": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
          "status": { "type": "string", "enum": ["pending", "success", "failed"] },
          "created_by_admin_id": { "type": ["string", "null"] },
          "otp_verified": { "type": "boolean" },
          "created_at": { "type": "string", "format": "date-time" }
        }
      }
    },
    "pagination": {
      "type": "object",
      "required": ["page", "limit", "total", "total_pages"],
      "properties": {
        "page": { "type": "integer", "minimum": 1 },
        "limit": { "type": "integer", "minimum": 1 },
        "total": { "type": "integer", "minimum": 0 },
        "total_pages": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `500 INTERNAL_SERVER_ERROR`

## GET /me/notifications

Lists notifications for the authenticated customer.

Auth: customer

Query params:

```json
{
  "type": "object",
  "properties": {
    "is_read": { "type": "boolean" },
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20
    }
  }
}
```

Request body: none

Response body:

```json
{
  "type": "object",
  "required": ["data", "pagination"],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "customer_id", "title", "body", "is_read", "created_at"],
        "properties": {
          "id": { "type": "string" },
          "customer_id": { "type": "string" },
          "title": { "type": "string" },
          "body": { "type": "string" },
          "is_read": { "type": "boolean" },
          "created_at": { "type": "string", "format": "date-time" }
        }
      }
    },
    "pagination": {
      "type": "object",
      "required": ["page", "limit", "total", "total_pages"],
      "properties": {
        "page": { "type": "integer", "minimum": 1 },
        "limit": { "type": "integer", "minimum": 1 },
        "total": { "type": "integer", "minimum": 0 },
        "total_pages": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

Possible error codes:

- `400 VALIDATION_ERROR`
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `500 INTERNAL_SERVER_ERROR`
