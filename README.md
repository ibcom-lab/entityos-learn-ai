# entityos-ai
AI Services

## aifactory.financials:

### Bank reconcilation:
	- Yodlee interface loads transactions; give user 05f023c2-817c-4be9-900f-6021a7602bec access into space & setup-role-access-yodlee.json
    - Get the bank accounts
    - Check event for which bank accounts
    - Get transactions and apply mappings
    - Create posts into conversation of ones can't reconcile or actions.

### Debtor follow ups:

### Tax Reporting:

lambda-local -l index.js -t 9000 -e event-ai-financials-bank-reconciliation.json

## aifactory.financials.util:

### Get bank accounts:

lambda-local -l index.js -t 9000 -e event-ai-financials-util.json



