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

    /**
     * Initializes the page.
     */
    const pageInit = () => {

        console.log('Receive Lots initialized');

    };

    /**
     * Triggered when a field changes.
     */
    const fieldChanged = (context) => {

        if (context.fieldId !== 'custpage_barcode') {
            return;
        }

        scanLot();

    };

    /**
     * Reads the barcode field and requests the weight.
     */
    const scanLot = async () => {

        const rec = currentRecord.get();

        const purchaseOrder = rec.getValue('custpage_poid');
        const location = rec.getValue('custpage_location');
        const scale = rec.getValue('custpage_scale');
        const lot = rec.getValue('custpage_barcode');

        if (!lot) {
            return;
        }

        if (!location) {

            showMessage(
                'Location Required',
                'Please select a warehouse location.',
                message.Type.WARNING
            );

            return;
        }

        if (!scale) {

            showMessage(
                'Scale Required',
                'Please select a scale.',
                message.Type.WARNING
            );

            return;
        }

        try {

            const suiteletUrl = window.location.href;

            const response = await fetch(suiteletUrl, {

                method: 'POST',

                headers: {

                    'Content-Type': 'application/json'

                },

                body: JSON.stringify({

                    action: 'scanLot',
                    purchaseOrder,
                    location,
                    scale,
                    lot

                })

            });

            const result = await response.json();

            if (!result.success) {

                showMessage(
                    'Lot Not Found',
                    result.message,
                    message.Type.ERROR
                );

                rec.setValue({
                    fieldId: 'custpage_barcode',
                    value: ''
                });

                return;

            }

            updateWeight(result.lot, result.weight);

            rec.setValue({

                fieldId: 'custpage_barcode',
                value: ''

            });

        }

        catch (e) {

            console.error(e);

            showMessage(
                'Error',
                e.message,
                message.Type.ERROR
            );

        }

    };

    /**
     * Updates the weight column for the scanned lot.
     */
    const updateWeight = (lotNumber, weight) => {

        const rec = currentRecord.get();

        const lineCount = rec.getLineCount({

            sublistId: 'custpage_lots'

        });

        for (let i = 0; i < lineCount; i++) {

            const lot = rec.getSublistValue({

                sublistId: 'custpage_lots',
                fieldId: 'lot',
                line: i

            });

            if (lot !== lotNumber) {
                continue;
            }

            rec.selectLine({

                sublistId: 'custpage_lots',
                line: i

            });

            rec.setCurrentSublistValue({

                sublistId: 'custpage_lots',
                fieldId: 'weight',
                value: weight

            });

            rec.commitLine({

                sublistId: 'custpage_lots'

            });

            break;

        }

    };

    /**
     * Returns to the Purchase Order.
     */
    const cancelReceiving = () => {

        history.back();

    };

    /**
     * Before Save.
     */
    const saveRecord = () => {

        return true;

    };

    /**
     * Shows a NetSuite message.
     */
    const showMessage = (title, text, type) => {

        message.create({

            title,
            message: text,
            type

        }).show({

            duration: 3000

        });

    };

    return {

        pageInit,
        fieldChanged,
        saveRecord,
        cancelReceiving

    };

});
