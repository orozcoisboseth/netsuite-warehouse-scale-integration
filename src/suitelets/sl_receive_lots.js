/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define([
    'N/ui/serverWidget',
    'N/runtime',
    'N/record',

    '../services/purchase_order_service',
    '../services/scale_service',
    '../services/item_receipt_service'
], (
    serverWidget,
    runtime,
    record,

    PurchaseOrderService,
    ScaleService,
    ItemReceiptService
) => {

    /*
     * Replace these IDs with the NetSuite roles allowed
     * to manually enter lot weights.
     */
    const MANUAL_WEIGHT_ROLES = [
        '1234'
    ];

    const ACTION = {
        SCAN_LOT: 'scanLot',
        SAVE: 'save'
    };

    const onRequest = (context) => {
        try {
            if (context.request.method === 'GET') {
                renderPage(context);
                return;
            }

            processPost(context);

        } catch (error) {
            log.error({
                title: 'Receive Lots Suitelet Error',
                details: error
            });

            writeJson(context, {
                success: false,
                message: error.message || 'An unexpected error occurred.'
            });
        }
    };

    /**
     * Renders the warehouse receiving interface.
     *
     * @param {Object} context
     */
    const renderPage = (context) => {
        const poId = context.request.parameters.poid;

        if (!poId) {
            throw new Error('Missing Purchase Order ID.');
        }

        const purchaseOrder = record.load({
            type: record.Type.PURCHASE_ORDER,
            id: poId,
            isDynamic: false
        });

        const subsidiaryId = purchaseOrder.getValue({
            fieldId: 'subsidiary'
        });

        const canEnterManualWeight = userCanEnterManualWeight();

        const form = serverWidget.createForm({
            title: 'Receive Lots'
        });

        form.clientScriptModulePath =
            '../clients/cs_receive_lots.js';

        addHiddenFields({
            form,
            poId,
            canEnterManualWeight
        });

        addReceivingFields({
            form,
            subsidiaryId
        });

        addLotsSublist({
            form,
            poId
        });

        /*
         * This is a custom button instead of a submit button because
         * the Client Script sends a JSON request to the Suitelet.
         */
        form.addButton({
            id: 'custpage_save',
            label: 'Save',
            functionName: 'saveReceiving'
        });

        form.addButton({
            id: 'custpage_cancel',
            label: 'Cancel',
            functionName: 'cancelReceiving'
        });

        context.response.writePage(form);
    };

    /**
     * Adds hidden values required by the Client Script.
     */
    const addHiddenFields = ({
        form,
        poId,
        canEnterManualWeight
    }) => {
        const poField = form.addField({
            id: 'custpage_poid',
            type: serverWidget.FieldType.TEXT,
            label: 'Purchase Order'
        });

        poField.defaultValue = String(poId);

        poField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        const manualWeightField = form.addField({
            id: 'custpage_can_manual_weight',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Can Enter Manual Weight'
        });

        manualWeightField.defaultValue =
            canEnterManualWeight ? 'T' : 'F';

        manualWeightField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });
    };

    /**
     * Adds location, scale, and barcode fields.
     */
    const addReceivingFields = ({
        form,
        subsidiaryId
    }) => {
        const locationField = form.addField({
            id: 'custpage_location',
            type: serverWidget.FieldType.SELECT,
            label: 'Location'
        });

        locationField.isMandatory = true;

        locationField.addSelectOption({
            value: '',
            text: ''
        });

        const locations =
            PurchaseOrderService.getLocations(subsidiaryId);

        locations.forEach((location) => {
            locationField.addSelectOption({
                value: String(location.id),
                text: location.name
            });
        });

        const scaleField = form.addField({
            id: 'custpage_scale',
            type: serverWidget.FieldType.SELECT,
            label: 'Scale'
        });

        scaleField.addSelectOption({
            value: '',
            text: ''
        });

        const scales = ScaleService.getAvailableScales();

        scales.forEach((scale) => {
            scaleField.addSelectOption({
                value: String(scale.id),
                text: scale.name
            });
        });

        form.addField({
            id: 'custpage_barcode',
            type: serverWidget.FieldType.TEXT,
            label: 'Scan Lot'
        });
    };

    /**
     * Adds the list of lots pending for the Purchase Order.
     */
    const addLotsSublist = ({
        form,
        poId
    }) => {
        const sublist = form.addSublist({
            id: 'custpage_lots',
            type: serverWidget.SublistType.LIST,
            label: 'Purchase Order Lots'
        });

        sublist.addField({
            id: 'lot',
            type: serverWidget.FieldType.TEXT,
            label: 'Lot'
        });

        sublist.addField({
            id: 'item',
            type: serverWidget.FieldType.TEXT,
            label: 'Item'
        });

        sublist.addField({
            id: 'quantity',
            type: serverWidget.FieldType.FLOAT,
            label: 'Quantity'
        });

        const weightField = sublist.addField({
            id: 'weight',
            type: serverWidget.FieldType.FLOAT,
            label: 'Weight'
        });

        /*
         * The field must remain editable for the Client Script.
         * Manual user changes are restricted in validateField().
         */
        weightField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.ENTRY
        });

        const lots =
            PurchaseOrderService.getPendingLots(poId);

        lots.forEach((lot, line) => {
            setSublistValue({
                sublist,
                id: 'lot',
                line,
                value: lot.number
            });

            setSublistValue({
                sublist,
                id: 'item',
                line,
                value: lot.item
            });

            setSublistValue({
                sublist,
                id: 'quantity',
                line,
                value: lot.quantity
            });
        });
    };

    /**
     * Processes JSON requests from the Client Script.
     */
    const processPost = (context) => {
        const body = parseRequestBody(context.request.body);

        switch (body.action) {
            case ACTION.SCAN_LOT:
                processScan(context, body);
                break;

            case ACTION.SAVE:
                processSave(context, body);
                break;

            default:
                writeJson(context, {
                    success: false,
                    message: 'Invalid action.'
                });
        }
    };

    /**
     * Validates the lot and obtains its weight from the selected scale.
     */
    const processScan = (context, body) => {
        requireValue(
            body.purchaseOrder,
            'Purchase Order is required.'
        );

        requireValue(
            body.location,
            'Location is required.'
        );

        requireValue(
            body.scale,
            'Scale is required.'
        );

        requireValue(
            body.lot,
            'Lot barcode is required.'
        );

        const validation =
            PurchaseOrderService.validateLot({
                purchaseOrder: body.purchaseOrder,
                lot: body.lot
            });

        if (!validation.success) {
            writeJson(context, {
                success: false,
                message:
                    'The scanned lot does not belong to this Purchase Order.'
            });

            return;
        }

        const weight = ScaleService.getWeight({
            scale: body.scale,
            location: body.location
        });

        const numericWeight = Number(weight);

        if (
            !Number.isFinite(numericWeight) ||
            numericWeight <= 0
        ) {
            throw new Error(
                'The scale returned an invalid weight.'
            );
        }

        writeJson(context, {
            success: true,
            lot: body.lot,
            weight: numericWeight
        });
    };

    /**
     * Creates an Item receipt with lots that contain weight.
     */
    const processSave = (context, body) => {
        requireValue(
            body.purchaseOrder,
            'Purchase Order is required.'
        );

        requireValue(
            body.location,
            'Location is required.'
        );

        const lots = Array.isArray(body.lots)
            ? body.lots.filter((lot) => {
                const weight = Number(lot.weight);

                return (
                    Number.isFinite(weight) &&
                    weight > 0
                );
            })
            : [];

        if (!lots.length) {
            writeJson(context, {
                success: false,
                message:
                    'Capture a weight for at least one lot before saving.'
            });

            return;
        }

        const itemReceiptId  =
            ItemReceiptService.create({
                purchaseOrder: body.purchaseOrder,
                location: body.location,
                lots
            });

        writeJson(context, {
            success: true,
            itemReceiptId 
        });
    };

    /**
     * Determines whether the current role can manually enter weights.
     */
    const userCanEnterManualWeight = () => {
        const currentRole = String(
            runtime.getCurrentUser().role
        );

        return MANUAL_WEIGHT_ROLES.includes(currentRole);
    };

    const parseRequestBody = (requestBody) => {
        if (!requestBody) {
            throw new Error('The request body is empty.');
        }

        try {
            return JSON.parse(requestBody);
        } catch (error) {
            throw new Error('The request body is not valid JSON.');
        }
    };

    const requireValue = (value, errorMessage) => {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            throw new Error(errorMessage);
        }
    };

    const setSublistValue = ({
        sublist,
        id,
        line,
        value
    }) => {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            return;
        }

        sublist.setSublistValue({
            id,
            line,
            value: String(value)
        });
    };

    const writeJson = (context, payload) => {
        context.response.setHeader({
            name: 'Content-Type',
            value: 'application/json; charset=utf-8'
        });

        context.response.write(
            JSON.stringify(payload)
        );
    };

    return {
        onRequest
    };

});
