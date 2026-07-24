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
    '../services/item_fulfillment_service'

], (

    serverWidget,
    runtime,
    record,

    PurchaseOrderService,
    ScaleService,
    ItemFulfillmentService

) => {

    // Replace with the role that can manually enter weights.
    const MANUAL_WEIGHT_ROLE = 1234;

    const onRequest = (context) => {

        if (context.request.method === 'GET') {
            return renderPage(context);
        }

        const body = JSON.parse(context.request.body);

        switch (body.action) {

            case 'scanLot':
                return processScan(context, body);

            case 'save':
                return processSave(context, body);

            default:

                context.response.write(JSON.stringify({

                    success: false,
                    message: 'Invalid action.'

                }));

        }

    };

    /**
     * ------------------------------------------------------------------
     * GET
     * ------------------------------------------------------------------
     */

    const renderPage = (context) => {

        const poId = context.request.parameters.poid;

        if (!poId) {

            context.response.write('Missing Purchase Order.');

            return;

        }

        const purchaseOrder = record.load({

            type: record.Type.PURCHASE_ORDER,
            id: poId

        });

        const subsidiary = purchaseOrder.getValue('subsidiary');

        const form = serverWidget.createForm({

            title: 'Receive Lots'

        });

        form.clientScriptModulePath =
            '../clients/cs_receive_lots.js';

        /**
         * Hidden Purchase Order Id
         */

        const fldPO = form.addField({

            id: 'custpage_poid',

            label: 'Purchase Order',

            type: serverWidget.FieldType.TEXT

        });

        fldPO.defaultValue = poId;

        fldPO.updateDisplayType({

            displayType:
            serverWidget.FieldDisplayType.HIDDEN

        });

        /**
         * Warehouse Location
         */

        const fldLocation = form.addField({

            id: 'custpage_location',

            label: 'Location',

            type: serverWidget.FieldType.SELECT

        });

        fldLocation.addSelectOption({

            value: '',
            text: ''

        });

        PurchaseOrderService
            .getLocations(subsidiary)
            .forEach(location => {

                fldLocation.addSelectOption({

                    value: location.id,
                    text: location.name

                });

            });

        /**
         * Scale
         */

        const fldScale = form.addField({

            id: 'custpage_scale',

            label: 'Scale',

            type: serverWidget.FieldType.SELECT

        });

        fldScale.addSelectOption({

            value: '',
            text: ''

        });

        ScaleService
            .getAvailableScales()
            .forEach(scale => {

                fldScale.addSelectOption({

                    value: scale.id,
                    text: scale.name

                });

            });

        /**
         * Barcode
         */

        form.addField({

            id: 'custpage_barcode',

            label: 'Scan Lot',

            type: serverWidget.FieldType.TEXT

        });

        /**
         * Lots
         */

        const sublist = form.addSublist({

            id: 'custpage_lots',

            label: 'Lots',

            type: serverWidget.SublistType.LIST

        });

        sublist.addField({

            id: 'lot',

            label: 'Lot',

            type: serverWidget.FieldType.TEXT

        });

        sublist.addField({

            id: 'item',

            label: 'Item',

            type: serverWidget.FieldType.TEXT

        });

        sublist.addField({

            id: 'quantity',

            label: 'Quantity',

            type: serverWidget.FieldType.FLOAT

        });

        const weightField = sublist.addField({

            id: 'weight',

            label: 'Weight',

            type: serverWidget.FieldType.FLOAT

        });

        /**
         * Manual weight permission
         */

        const currentRole = runtime.getCurrentUser().role;

        if (currentRole !== MANUAL_WEIGHT_ROLE) {

            weightField.updateDisplayType({

                displayType:
                serverWidget.FieldDisplayType.INLINE

            });

        }

        /**
         * Pending Lots
         */

        const lots =
            PurchaseOrderService
                .getPendingLots(poId);

        lots.forEach((lot, line) => {

            sublist.setSublistValue({

                id: 'lot',
                line,
                value: lot.number

            });

            sublist.setSublistValue({

                id: 'item',
                line,
                value: lot.item

            });

            sublist.setSublistValue({

                id: 'quantity',
                line,
                value: String(lot.quantity)

            });

        });

        form.addSubmitButton({

            label: 'Save'

        });

        form.addButton({

            id: 'custpage_cancel',

            label: 'Cancel',

            functionName: 'cancelReceiving'

        });

        context.response.writePage(form);

    };

    /**
     * ------------------------------------------------------------------
     * Scan Lot
     * ------------------------------------------------------------------
     */

    const processScan = (context, body) => {

        const validation =
            PurchaseOrderService.validateLot({

                purchaseOrder: body.purchaseOrder,

                lot: body.lot

            });

        if (!validation.success) {

            context.response.write(JSON.stringify({

                success: false,

                message:
                    'The scanned lot does not belong to this Purchase Order.'

            }));

            return;

        }

        const weight =
            ScaleService.getWeight({

                scale: body.scale,

                location: body.location

            });

        context.response.write(JSON.stringify({

            success: true,

            lot: body.lot,

            weight

        }));

    };

    /**
     * ------------------------------------------------------------------
     * Save
     * ------------------------------------------------------------------
     */

    const processSave = (context, body) => {

        const fulfillmentId =
            ItemFulfillmentService.create({

                purchaseOrder: body.purchaseOrder,

                location: body.location,

                lots: body.lots

            });

        context.response.write(JSON.stringify({

            success: true,

            fulfillmentId

        }));

    };

    return {

        onRequest

    };

});
