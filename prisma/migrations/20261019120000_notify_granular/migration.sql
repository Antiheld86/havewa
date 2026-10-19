-- Granulare Benachrichtigungen (#80): PAYMENTS und LETTER_STATUS in Einzelarten aufteilen
UPDATE "Tenant" SET "notifyEmail" = array_remove("notifyEmail", 'PAYMENTS') || ARRAY['PAYMENTS_IN', 'PAYMENTS_OUT']
WHERE 'PAYMENTS' = ANY("notifyEmail");
UPDATE "Tenant" SET "notifyEmail" = array_remove("notifyEmail", 'LETTER_STATUS') || ARRAY['LETTER_SENT', 'LETTER_DELIVERED', 'LETTER_FAILED']
WHERE 'LETTER_STATUS' = ANY("notifyEmail");
