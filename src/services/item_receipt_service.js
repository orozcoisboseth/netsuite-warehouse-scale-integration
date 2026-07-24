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

    const CONFIG = {
        INVENTORY_NUMBER_WEIGHT_FIELD:
            'custitemnumber_weight'
    };

    /**
     * Creates an Item Receipt from a Purchase Order.
     *
     * Each received lot represents one inventory unit.
     *
     * @param {Object} options
     * @param {string|number} options.purchaseOrder
     * @param {string|number} options.location
     * @param {Array<Object>} options.lots
     * @returns {number|string} Item Receipt internal ID
     */
    const create = ({
        purchaseOrder,
        location,
        lots
    }) => {
        requireValue(
            purchaseOrder,
            'Purchase Order ID is required.'
        );

        requireValue(
            location,
            'Location is required.'
        );

        validateLots(lots);

        /*
         * Load the source Purchase Order so each poLine can be
         * associated with its source line and item.
         */
        const purchaseOrderRecord = record.load({
            type: record.Type.PURCHASE_ORDER,
            id: purchaseOrder,
            isDynamic: false
        });

        const groupedLots = groupLotsByPurchaseOrderLine({
            purchaseOrderRecord,
            lots
        });

        /*
         * Purchase Orders must be transformed into Item Receipts.
         */
        const itemReceipt = record.transform({
            fromType: record.Type.PURCHASE_ORDER,
            fromId: purchaseOrder,
            toType: record.Type.ITEM_RECEIPT,
            isDynamic: true
        });

        /*
         * Disable all lines first. Only lines included in the
         * request will be received.
         */
        clearReceivedLines(itemReceipt);

        const usedReceiptLines = new Set();

        groupedLots.forEach((group) => {
            const receiptLine = findReceiptLine({
                itemReceipt,
                group,
                usedReceiptLines
            });

            if (receiptLine === -1) {
                throw new Error(
                    `Unable to find the Item Receipt line for Purchase Order line ${group.poLine}.`
                );
            }

            configureReceiptLine({
                itemReceipt,
                receiptLine,
                location,
                group
            });

            usedReceiptLines.add(receiptLine);
        });

        const itemReceiptId = itemReceipt.save({
            enableSourcing: true,
            ignoreMandatoryFields: false
        });

        /*
         * Inventory Number records are generated or updated after
         * the Item Receipt is saved.
         */
        updateInventoryNumberWeights({
            itemReceiptId,
            groupedLots
        });

        return itemReceiptId;
    };

    /**
     * Unchecks all lines in the transformed Item Receipt.
     */
    const clearReceivedLines = (itemReceipt) => {
        const lineCount = itemReceipt.getLineCount({
            sublistId: 'item'
        });

        for (let line = 0; line < lineCount; line++) {
            itemReceipt.selectLine({
                sublistId: 'item',
                line
            });

            itemReceipt.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'itemreceive',
                value: false,
                ignoreFieldChange: true
            });

            itemReceipt.commitLine({
                sublistId: 'item'
            });
        }
    };

    /**
     * Configures one Item Receipt line and its inventory detail.
     */
    const configureReceiptLine = ({
        itemReceipt,
        receiptLine,
        location,
        group
    }) => {
        itemReceipt.selectLine({
            sublistId: 'item',
            line: receiptLine
        });

        itemReceipt.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'itemreceive',
            value: true,
            ignoreFieldChange: true
        });

        itemReceipt.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'location',
            value: location,
            ignoreFieldChange: true
        });

        /*
         * Every lot represents one piece.
         */
        itemReceipt.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: group.lots.length,
            ignoreFieldChange: true
        });

        const inventoryDetail =
            itemReceipt.getCurrentSublistSubrecord({
                sublistId: 'item',
                fieldId: 'inventorydetail'
            });

        if (!inventoryDetail) {
            throw new Error(
                `Inventory Detail is not available for Purchase Order line ${group.poLine}.`
            );
        }

        clearInventoryAssignments(inventoryDetail);

        group.lots.forEach((lot) => {
            inventoryDetail.selectNewLine({
                sublistId: 'inventoryassignment'
            });

            inventoryDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'receiptinventorynumber',
                value: lot.lot
            });

            inventoryDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'quantity',
                value: 1
            });

            inventoryDetail.commitLine({
                sublistId: 'inventoryassignment'
            });
        });

        itemReceipt.commitLine({
            sublistId: 'item'
        });
    };

    /**
     * Removes assignments copied from the Purchase Order during
     * the transformation.
     */
    const clearInventoryAssignments = (
        inventoryDetail
    ) => {
        const assignmentCount =
            inventoryDetail.getLineCount({
                sublistId: 'inventoryassignment'
            });

        for (
            let line = assignmentCount - 1;
            line >= 0;
            line--
        ) {
            inventoryDetail.removeLine({
                sublistId: 'inventoryassignment',
                line,
                ignoreRecalc: true
            });
        }
    };

    /**
     * Groups the selected lots by their original Purchase Order line.
     */
    const groupLotsByPurchaseOrderLine = ({
        purchaseOrderRecord,
        lots
    }) => {
        const grouped = new Map();

        const poLineCount =
            purchaseOrderRecord.getLineCount({
                sublistId: 'item'
            });

        lots.forEach((lot) => {
            const poLine = Number(lot.poLine);

            if (
                !Number.isInteger(poLine) ||
                poLine < 0 ||
                poLine >= poLineCount
            ) {
                throw new Error(
                    `Invalid Purchase Order line for lot ${lot.lot}.`
                );
            }

            const itemId =
                purchaseOrderRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: poLine
                });

            /*
             * The source line reference is normally carried to the
             * transformed transaction through the orderline field.
             */
            const sourceLineReference =
                getOptionalSublistValue({
                    transaction:
                        purchaseOrderRecord,
                    sublistId: 'item',
                    fieldId: 'line',
                    line: poLine
                });

            const key = String(poLine);

            if (!grouped.has(key)) {
                grouped.set(key, {
                    poLine,
                    itemId: String(itemId),
                    sourceLineReference:
                        sourceLineReference === null
                            ? null
                            : String(sourceLineReference),
                    lots: []
                });
            }

            grouped.get(key).lots.push({
                lot: String(lot.lot),
                weight: Number(lot.weight)
            });
        });

        return Array.from(grouped.values());
    };

    /**
     * Finds the corresponding line in the transformed Item Receipt.
     *
     * Search order:
     * 1. Source order line reference.
     * 2. Same line index and item.
     * 3. First unused line containing the same item.
     */
    const findReceiptLine = ({
        itemReceipt,
        group,
        usedReceiptLines
    }) => {
        const lineCount = itemReceipt.getLineCount({
            sublistId: 'item'
        });

        /*
         * Preferred matching method: transformed order line.
         */
        if (group.sourceLineReference !== null) {
            for (
                let line = 0;
                line < lineCount;
                line++
            ) {
                if (usedReceiptLines.has(line)) {
                    continue;
                }

                const orderLine =
                    getOptionalSublistValue({
                        transaction: itemReceipt,
                        sublistId: 'item',
                        fieldId: 'orderline',
                        line
                    });

                if (
                    orderLine !== null &&
                    String(orderLine) ===
                        group.sourceLineReference
                ) {
                    return line;
                }
            }
        }

        /*
         * Fallback when the transformed transaction preserves the
         * source line position.
         */
        if (
            group.poLine < lineCount &&
            !usedReceiptLines.has(group.poLine)
        ) {
            const itemId =
                itemReceipt.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: group.poLine
                });

            if (
                String(itemId) ===
                String(group.itemId)
            ) {
                return group.poLine;
            }
        }

        /*
         * Final fallback for Purchase Orders where each item appears
         * only once.
         */
        for (
            let line = 0;
            line < lineCount;
            line++
        ) {
            if (usedReceiptLines.has(line)) {
                continue;
            }

            const itemId =
                itemReceipt.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line
                });

            if (
                String(itemId) ===
                String(group.itemId)
            ) {
                return line;
            }
        }

        return -1;
    };

    /**
     * Updates the custom weight field on each Inventory Number.
     */
    const updateInventoryNumberWeights = ({
        itemReceiptId,
        groupedLots
    }) => {
        groupedLots.forEach((group) => {
            group.lots.forEach((lot) => {
                const inventoryNumberId =
                    findInventoryNumber({
                        itemId: group.itemId,
                        lotNumber: lot.lot
                    });

                if (!inventoryNumberId) {
                    throw new Error(
                        `Item Receipt ${itemReceiptId} was created, but Inventory Number ${lot.lot} could not be found.`
                    );
                }

                record.submitFields({
                    type: 'inventorynumber',
                    id: inventoryNumberId,
                    values: {
                        [CONFIG
                            .INVENTORY_NUMBER_WEIGHT_FIELD]:
                            lot.weight
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: false
                    }
                });
            });
        });
    };

    /**
     * Finds an Inventory Number using its item and lot number.
     */
    const findInventoryNumber = ({
        itemId,
        lotNumber
    }) => {
        let inventoryNumberId = null;

        const inventoryNumberSearch =
            search.create({
                type: search.Type.INVENTORY_NUMBER,
                filters: [
                    [
                        'item',
                        search.Operator.ANYOF,
                        itemId
                    ],
                    'AND',
                    [
                        'inventorynumber',
                        search.Operator.IS,
                        lotNumber
                    ]
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid'
                    })
                ]
            });

        inventoryNumberSearch.run().each(
            (result) => {
                inventoryNumberId =
                    String(result.id);

                return false;
            }
        );

        return inventoryNumberId;
    };

    /**
     * Validates the lots received from the Suitelet.
     */
    const validateLots = (lots) => {
        if (
            !Array.isArray(lots) ||
            !lots.length
        ) {
            throw new Error(
                'At least one lot is required.'
            );
        }

        const lotNumbers = new Set();

        lots.forEach((lot) => {
            requireValue(
                lot.poLine,
                'Purchase Order line is required.'
            );

            requireValue(
                lot.lot,
                'Lot number is required.'
            );

            const weight = Number(lot.weight);

            if (
                !Number.isFinite(weight) ||
                weight <= 0
            ) {
                throw new Error(
                    `Invalid weight for lot ${lot.lot}.`
                );
            }

            const lotNumber = String(lot.lot);

            if (lotNumbers.has(lotNumber)) {
                throw new Error(
                    `Lot ${lotNumber} was included more than once.`
                );
            }

            lotNumbers.add(lotNumber);
        });
    };

    /**
     * Reads an optional sublist field without failing when the field
     * is unavailable in a specific account or transaction form.
     */
    const getOptionalSublistValue = ({
        transaction,
        sublistId,
        fieldId,
        line
    }) => {
        try {
            const value =
                transaction.getSublistValue({
                    sublistId,
                    fieldId,
                    line
                });

            if (
                value === null ||
                value === undefined ||
                value === ''
            ) {
                return null;
            }

            return value;

        } catch (error) {
            return null;
        }
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
        create
    };

});
