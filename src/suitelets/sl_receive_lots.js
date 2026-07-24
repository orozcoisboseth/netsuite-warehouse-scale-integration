/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define([
    'N/ui/serverWidget',
    'N/runtime',
    'N/redirect',
    'N/search',
    'N/record',

    '../services/purchase_order_service',
    '../services/scale_service',
    '../services/fulfillment_service'

], (

    serverWidget,
    runtime,
    redirect,
    search,
    record,

    PurchaseOrderService,
    ScaleService,
    FulfillmentService

) => {

    const MANUAL_WEIGHT_ROLE = 1234;
    // Replace with your custom role.

    const onRequest = (context) => {

        if (context.request.method === 'GET') {

            return renderPage(context);

        }

        return processRequest(context);

    };

    /**
     * ----------------------------------------------------------------------
     * GET
     * ----------------------------------------------------------------------
     */

    const renderPage = (context) => {

        const poId = context.request.parameters.poid;

        if (!poId) {

            context.response.write('Missing Purchase Order.');

            return;

        }

        const po = record.load({

            type: record.Type.PURCHASE_ORDER,
            id: poId

        });

        const subsidiary = po.getValue('subsidiary');

        const form = serverWidget.createForm({

            title: 'Receive Lots'

        });

        form.clientScriptModulePath =
            '../clients/cs_receive_lots.js';

        /**
         * Hidden Purchase Order
         */

        const fldPo = form.addField({

            id: 'custpage_poid',
            type: serverWidget.FieldType.TEXT,
            label: 'PO'

        });

        fldPo.defaultValue = poId;
        fldPo.updateDisplayType({

            displayType: serverWidget.FieldDisplayType.HIDDEN

        });

        /**
         * Location
         */

        const fldLocation = form.addField({

            id: 'custpage_location',
            type: serverWidget.FieldType.SELECT,
            label: 'Location'

        });

        loadLocations(fldLocation, subsidiary);

        /**
         * Scale
         */

        const fldScale = form.addField({

            id: 'custpage_scale',
            type: serverWidget.FieldType.SELECT,
            label: 'Scale'

        });

        loadScales(fldScale);

        /**
         * Barcode
         */

        form.addField({

            id: 'custpage_barcode',

            type: serverWidget.FieldType.TEXT,

            label: 'Scan Lot'

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

            id: 'qty',

            label: 'Quantity',

            type: serverWidget.FieldType.FLOAT

        });

        const weight = sublist.addField({

            id: 'weight',

            label: 'Weight',

            type: serverWidget.FieldType.FLOAT

        });

        /**
         * Role validation
         */

        const currentRole = runtime.getCurrentUser().role;

        if (currentRole !== MANUAL_WEIGHT_ROLE) {

            weight.updateDisplayType({

                displayType:
                serverWidget.FieldDisplayType.INLINE

            });

        }

        /**
         * Pending lots
         */

        PurchaseOrderService.loadLots(poId)
            .forEach((lot, line) => {

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

                    id: 'qty',

                    line,

                    value: lot.quantity.toString()

                });

            });

        form.addSubmitButton({

            label: 'Save'

        });

        form.addButton({

            id: 'cancel',

            label: 'Cancel',

            functionName: 'cancelReceiving'

        });

        context.response.writePage(form);

    };

    /**
     * ----------------------------------------------------------------------
     * POST
     * ----------------------------------------------------------------------
     */

    const processRequest = (context) => {

        const action = context.request.parameters.action;

        switch (action) {

            case 'scanLot':

                return processScan(context);

            case 'save':

                return processSave(context);

            case 'cancel':

                return processCancel(context);

        }

    };

    /**
     * Scan barcode
     */

    const processScan = (context) => {

        const body = JSON.parse(context.request.body);

        const validation =
            PurchaseOrderService.validateLot({

                purchaseOrder: body.purchaseOrder,

                lot: body.lot

            });

        if (!validation.success) {

            context.response.write(JSON.stringify({

                success: false,

                message:
                    'Lot does not belong to this Purchase Order.'

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
     * Save Item Fulfillment
     */

    const processSave = (context) => {

        const body = JSON.parse(context.request.body);

        const fulfillmentId =
            FulfillmentService.create(body);

        context.response.write(JSON.stringify({

            success: true,

            fulfillmentId

        }));

    };

    /**
     * Cancel
     */

    const processCancel = (context) {

        redirect.toRecord({

            type: record.Type.PURCHASE_ORDER,

            id: context.request.parameters.poid

        });

    }

    /**
     * Helpers
     */

    const loadLocations = (field, subsidiary) => {

        // Search locations for subsidiary

    };

    const loadScales = (field) => {

        // Search customrecord_scale

    };

    return {

        onRequest

    };

});
