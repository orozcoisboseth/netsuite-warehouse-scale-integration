/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */

define([
    'N/currentRecord',
    'N/url',
    'N/ui/message'
], (
    currentRecord,
    url,
    message
) => {

    let requestInProgress = false;

    /*
     * Distinguishes an automatic weight update from a manual
     * value entered by the user.
     */
    let automaticWeightUpdate = false;

    /**
     * Initializes the receiving page.
     */
    const pageInit = () => {
        console.log('Receive Lots initialized');
    };

    /**
     * Requests the scale weight when a lot barcode is entered.
     */
    const fieldChanged = (context) => {
        if (
            context.fieldId === 'custpage_barcode' &&
            !requestInProgress
        ) {
            scanLot();
        }
    };

    /**
     * Prevents unauthorized users from entering weights manually.
     *
     * The weight field remains editable so the Client Script can
     * populate it with the value returned by the scale.
     */
    const validateField = (context) => {
        if (
            context.sublistId !== 'custpage_lots' ||
            context.fieldId !== 'weight'
        ) {
            return true;
        }

        /*
         * Allow values populated automatically from the scale.
         */
        if (automaticWeightUpdate) {
            return true;
        }

        const rec = currentRecord.get();

        const canEnterManualWeight = rec.getValue({
            fieldId: 'custpage_can_manual_weight'
        });

        if (
            canEnterManualWeight === true ||
            canEnterManualWeight === 'T'
        ) {
            return true;
        }

        showMessage(
            'Manual Entry Not Allowed',
            'Your role can only capture weights from the selected scale.',
            message.Type.WARNING
        );

        return false;
    };

    /**
     * Validates the scanned lot and retrieves its weight.
     */
    const scanLot = async () => {
        const rec = currentRecord.get();

        const purchaseOrder = rec.getValue({
            fieldId: 'custpage_poid'
        });

        const location = rec.getValue({
            fieldId: 'custpage_location'
        });

        const scale = rec.getValue({
            fieldId: 'custpage_scale'
        });

        const lot = String(
            rec.getValue({
                fieldId: 'custpage_barcode'
            }) || ''
        );

        if (!lot) {
            return;
        }

        if (!location) {
            showMessage(
                'Location Required',
                'Please select a warehouse location.',
                message.Type.WARNING
            );

            clearBarcode(rec);
            return;
        }

        if (!scale) {
            showMessage(
                'Scale Required',
                'Please select a scale.',
                message.Type.WARNING
            );

            clearBarcode(rec);
            return;
        }

        requestInProgress = true;

        try {
            const result = await postToSuitelet({
                action: 'scanLot',
                purchaseOrder,
                location,
                scale,
                lot
            });

            if (!result.success) {
                showMessage(
                    'Unable to Capture Weight',
                    result.message ||
                        'The lot could not be processed.',
                    message.Type.ERROR
                );

                return;
            }

            const updated = updateWeight(
                result.lot,
                result.weight
            );

            if (!updated) {
                showMessage(
                    'Lot Not Found',
                    'The scanned lot was not found in the displayed list.',
                    message.Type.ERROR
                );

                return;
            }

            showMessage(
                'Weight Captured',
                `Lot ${result.lot}: ${result.weight}`,
                message.Type.CONFIRMATION
            );

        } catch (error) {
            console.error(error);

            showMessage(
                'Error',
                error.message ||
                    'An unexpected error occurred.',
                message.Type.ERROR
            );

        } finally {
            requestInProgress = false;
            clearBarcode(rec);
        }
    };

    /**
     * Updates the weight of the corresponding lot.
     *
     * @returns {boolean} True when the lot was found.
     */
    const updateWeight = (lotNumber, weight) => {
        const rec = currentRecord.get();

        const lineCount = rec.getLineCount({
            sublistId: 'custpage_lots'
        });

        const targetLot = String(
            lotNumber || ''
        );

        for (let line = 0; line < lineCount; line++) {
            const currentLot = String(
                rec.getSublistValue({
                    sublistId: 'custpage_lots',
                    fieldId: 'lot',
                    line
                }) || ''
            );

            if (currentLot !== targetLot) {
                continue;
            }

            rec.selectLine({
                sublistId: 'custpage_lots',
                line
            });

            /*
             * Temporarily allow the automatic weight update.
             */
            automaticWeightUpdate = true;

            try {
                rec.setCurrentSublistValue({
                    sublistId: 'custpage_lots',
                    fieldId: 'weight',
                    value: Number(weight),
                    ignoreFieldChange: true
                });

                rec.commitLine({
                    sublistId: 'custpage_lots'
                });

            } finally {
                automaticWeightUpdate = false;
            }

            return true;
        }

        return false;
    };

    /**
     * Creates an Item Receipt using only lots
     * with captured weight.
     */
    const saveReceiving = async () => {
        if (requestInProgress) {
            return;
        }

        const rec = currentRecord.get();

        const purchaseOrder = rec.getValue({
            fieldId: 'custpage_poid'
        });

        const location = rec.getValue({
            fieldId: 'custpage_location'
        });

        if (!location) {
            showMessage(
                'Location Required',
                'Please select a warehouse location.',
                message.Type.WARNING
            );

            return;
        }

        const lots = getLotsWithWeight(rec);

        if (!lots.length) {
            showMessage(
                'No Lots Selected',
                'Capture a weight for at least one lot before saving.',
                message.Type.WARNING
            );

            return;
        }

        requestInProgress = true;

        try {
            const result = await postToSuitelet({
                action: 'save',
                purchaseOrder,
                location,
                lots
            });

            if (!result.success) {
                showMessage(
                    'Unable to Save',
                    result.message ||
                        'The Item Receipt could not be created.',
                    message.Type.ERROR
                );

                return;
            }

            const itemReceiptUrl = url.resolveRecord({
                recordType: 'itemreceipt',
                recordId: result.itemReceiptId,
                isEditMode: false
            });

            window.location.assign(itemReceiptUrl);

        } catch (error) {
            console.error(error);

            showMessage(
                'Error',
                error.message ||
                    'An unexpected error occurred.',
                message.Type.ERROR
            );

        } finally {
            requestInProgress = false;
        }
    };

    /**
     * Returns only the sublist lines that have a valid weight.
     */
    const getLotsWithWeight = (rec) => {
        const lots = [];

        const lineCount = rec.getLineCount({
            sublistId: 'custpage_lots'
        });

        for (let line = 0; line < lineCount; line++) {
            const weight = Number(
                rec.getSublistValue({
                    sublistId: 'custpage_lots',
                    fieldId: 'weight',
                    line
                })
            );

            if (
                !Number.isFinite(weight) ||
                weight <= 0
            ) {
                continue;
            }

            const poLine = Number(
                rec.getSublistValue({
                    sublistId: 'custpage_lots',
                    fieldId: 'po_line',
                    line
                })
            );

            lots.push({
                poLine,
                lot: rec.getSublistValue({
                    sublistId: 'custpage_lots',
                    fieldId: 'lot',
                    line
                }),
                item: rec.getSublistValue({
                    sublistId: 'custpage_lots',
                    fieldId: 'item',
                    line
                }),
                quantity: Number(
                    rec.getSublistValue({
                        sublistId: 'custpage_lots',
                        fieldId: 'quantity',
                        line
                    })
                ) || 0,
                weight
            });
        }

        return lots;
    };

    /**
     * Returns to the originating Purchase Order.
     */
    const cancelReceiving = () => {
        const rec = currentRecord.get();

        const purchaseOrderId = rec.getValue({
            fieldId: 'custpage_poid'
        });

        if (!purchaseOrderId) {
            history.back();
            return;
        }

        const purchaseOrderUrl = url.resolveRecord({
            recordType: 'purchaseorder',
            recordId: purchaseOrderId,
            isEditMode: false
        });

        window.location.assign(purchaseOrderUrl);
    };

    /**
     * Sends a JSON request to the current Suitelet.
     */
    const postToSuitelet = async (payload) => {
        const response = await fetch(
            window.location.href,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(
                `Suitelet request failed (${response.status}).`
            );
        }

        try {
            return JSON.parse(responseText);

        } catch (error) {
            console.error(
                'Unexpected Suitelet response:',
                responseText
            );

            throw new Error(
                'The Suitelet returned an invalid response.'
            );
        }
    };

    /**
     * Clears the barcode field without triggering fieldChanged again.
     */
    const clearBarcode = (rec) => {
        rec.setValue({
            fieldId: 'custpage_barcode',
            value: '',
            ignoreFieldChange: true
        });
    };

    /**
     * Displays a NetSuite message.
     */
    const showMessage = (
        title,
        text,
        type
    ) => {
        message.create({
            title,
            message: text,
            type
        }).show({
            duration: 4000
        });
    };

    return {
        pageInit,
        fieldChanged,
        validateField,
        scanLot,
        saveReceiving,
        cancelReceiving
    };

});
