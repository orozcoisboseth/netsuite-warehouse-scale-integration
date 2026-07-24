/**
 * @NApiVersion 2.1
 */

define([
    'N/record',
    'N/search'
], (
    record,
    search
) => {

    /**
     * Returns active locations assigned to the subsidiary.
     *
     * @param {string|number} subsidiaryId
     * @returns {Array<{id: string, name: string}>}
     */
    const getLocations = (subsidiaryId) => {
        if (!subsidiaryId) {
            return [];
        }

        const locations = [];

        const locationSearch = search.create({
            type: search.Type.LOCATION,
            filters: [
                ['isinactive', search.Operator.IS, 'F'],
                'AND',
                [
                    'subsidiary',
                    search.Operator.ANYOF,
                    subsidiaryId
                ]
            ],
            columns: [
                search.createColumn({
                    name: 'name',
                    sort: search.Sort.ASC
                })
            ]
        });

        locationSearch.run().each((result) => {
            locations.push({
                id: String(result.id),
                name: result.getValue({
                    name: 'name'
                })
            });

            return true;
        });

        return locations;
    };

    /**
     * Returns lots assigned in the Purchase Order inventory detail
     * that still belong to lines with quantity pending to receive.
     *
     * @param {string|number} purchaseOrderId
     * @returns {Array<Object>}
     */
    const getPendingLots = (purchaseOrderId) => {
        requireValue(
            purchaseOrderId,
            'Purchase Order ID is required.'
        );

        const purchaseOrder = record.load({
            type: record.Type.PURCHASE_ORDER,
            id: purchaseOrderId,
            isDynamic: false
        });

        const pendingLots = [];

        const lineCount = purchaseOrder.getLineCount({
            sublistId: 'item'
        });

        for (let line = 0; line < lineCount; line++) {
            const itemId =
                purchaseOrder.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line
                });

            const itemName =
                purchaseOrder.getSublistText({
                    sublistId: 'item',
                    fieldId: 'item',
                    line
                });

            const quantity = Number(
                purchaseOrder.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    line
                })
            ) || 0;

            const quantityReceived = Number(
                purchaseOrder.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantityreceived',
                    line
                })
            ) || 0;

            const quantityPending =
                quantity - quantityReceived;

            if (quantityPending <= 0) {
                continue;
            }

            const inventoryDetail =
                getInventoryDetail({
                    purchaseOrder,
                    line
                });

            if (!inventoryDetail) {
                continue;
            }

            const assignmentCount =
                inventoryDetail.getLineCount({
                    sublistId: 'inventoryassignment'
                });

            for (
                let assignmentLine = 0;
                assignmentLine < assignmentCount;
                assignmentLine++
            ) {
                const lotNumber =
                    inventoryDetail.getSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'receiptinventorynumber',
                        line: assignmentLine
                    });

                const assignedQuantity = Number(
                    inventoryDetail.getSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        line: assignmentLine
                    })
                ) || 0;

                if (
                    lotNumber === null ||
                    lotNumber === undefined ||
                    lotNumber === '' ||
                    assignedQuantity <= 0
                ) {
                    continue;
                }

                pendingLots.push({
                    poLine: line,
                    assignmentLine,
                    number: String(lotNumber),
                    itemId: String(itemId),
                    item: itemName || String(itemId),
                    quantity: assignedQuantity,
                    lineQuantity: quantity,
                    quantityReceived,
                    quantityPending
                });
            }
        }

        return pendingLots;
    };

    /**
     * Validates that a scanned lot exists in the Purchase Order's
     * inventory detail and belongs to a pending transaction line.
     *
     * Lot comparison is exact and case-sensitive.
     *
     * @param {Object} options
     * @param {string|number} options.purchaseOrder
     * @param {string} options.lot
     * @returns {Object}
     */
    const validateLot = ({
        purchaseOrder,
        lot
    }) => {
        requireValue(
            purchaseOrder,
            'Purchase Order ID is required.'
        );

        const lotNumber = normalizeLotNumber(lot);

        if (!lotNumber) {
            return {
                success: false,
                message: 'Lot number is required.'
            };
        }

        const pendingLots =
            getPendingLots(purchaseOrder);

        const matchedLot = pendingLots.find(
            (pendingLot) =>
                normalizeLotNumber(
                    pendingLot.number
                ) === lotNumber
        );

        if (!matchedLot) {
            return {
                success: false,
                message:
                    'The scanned lot does not belong to this Purchase Order or its line is already fully received.'
            };
        }

        return {
            success: true,
            lot: matchedLot
        };
    };

    /**
     * Safely returns the Inventory Detail subrecord from a
     * Purchase Order item line.
     *
     * Some lines may not contain Inventory Detail, and attempting
     * to retrieve it may throw an error.
     *
     * @param {Object} options
     * @param {record.Record} options.purchaseOrder
     * @param {number} options.line
     * @returns {record.Subrecord|null}
     */
    const getInventoryDetail = ({
        purchaseOrder,
        line
    }) => {
        try {
            return purchaseOrder.getSublistSubrecord({
                sublistId: 'item',
                fieldId: 'inventorydetail',
                line
            }) || null;

        } catch (error) {
            return null;
        }
    };

    /**
     * Converts a lot number to a string without modifying it.
     *
     * No trimming or case conversion is applied because the
     * receiving process requires an exact match.
     *
     * @param {*} lotNumber
     * @returns {string}
     */
    const normalizeLotNumber = (lotNumber) => {
        return String(lotNumber || '');
    };

    const requireValue = (
        value,
        errorMessage
    ) => {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            throw new Error(errorMessage);
        }
    };

    return {
        getLocations,
        getPendingLots,
        validateLot
    };

});
