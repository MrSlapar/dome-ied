# Interchain Event Distributor

## 1. Scope

This document outlines the specifications for the Interchain Event Distributor component. This component is aimed to connect to the different blockchain networks in order to have replication between different networks.

## 2. Objectives

- Each event published in one network shall be published to all the networks.
- Each event subscription shall be triggered whenever an event is published to one of the networks.

## 3. Preconditions

- DOME Operator Desmos is connected to an IED with access to all networks for publishing and subscribing.
- Other Access Nodes do not need to have access to all networks.

## 4. Flows to be addressed

- Desmos component shall change from calling to the DLT Adapter to calling the IED. This implies that there is a need to maintain already defined endpoints that now will go through the IED to each DLT Adapter whenever possible.
- The IED shall register in a cache-like the already published events (via propagation or direct publication) and to which networks have they been propagated to.
- Each event shall have a unique identifier, which already exists in the form of the "dataLocation" claim of the JWT received by the IED, which is a string url like `…?hl=<value>...` being "value" the value to be used as the unique identifier. From now on we consider this as the global id of the event.

### 4.1 Publication flow

- The IED will receive the event publication request following the same structure as the publish call of the DLT Adapter.
- The DOME Operator IED will be connected to all available networks so every other IED will receive it even in the case that they are not connected to all the networks.

#### 4.1.1 Direct publication

![Direct Publication Diagram](./4.1.1.Direct_publication_diagram.png)

- Desmos requests event publication as it already does to the DLT Adapter as of now but to the IED instead. This means that the env parameter is already set while the network one will have to be added by the respective DLT Adapter.
- Event publication is requested to each configured DLT Adapter. In this case it is the one for the A network. The payload is the same received by the IED.
- Previously to event publication the event is built adding a new field for the network with that same name. **TO BE CONFIRMED**

#### 4.1.2 Replication publication

![Replication Publication Diagram](./4.1.2Replication_publication.png)

- The body each event received for republication is stripped from the received one in order to be able to pass it as an event to be published to each DLT Adapter in the same way Desmos does for direct publication. This means eliminating the network parameter added by the respective DLT Adapter.
- Event publication is requested in the same way that in the direct publication, using the same payload.
- The respective DLT Adapter adds the network parameter to form the event.
- Everything else is exactly like in the direct publication flow

### 4.2 Subscription flow

![Subscription Flow Diagram](./4.2%20Subscription_flow.png)

The IED shall have two different subscription mechanisms:

- **Subscription to all events** happening at each configured DLT Adapter for internal use for replication purposes. In the case of the DOME Operator this would be both HashNET and Alastria T Adapters as of now but could be other technologies like a Fabric DLT Adapter and so on.
- **Subscription to events of interest** as a subscription call for Desmos. This call will return an event without the network parameter while maintaining the current interface and redirecting the call directly to each configured DLT Adapter.
- The IED shall republish the content retrieved from events of each DLT Adapter to the other ones that are not already in the IED cache as already replicated events. This shall only be applied to the subscription to all events flow to avoid replicating an already replicated event.

#### Subscription Flow Steps

1. The IED subscribes to all DOME Events calling each configured DLT Adapter.

2. & 3. Every DOME Event received is then added to a set of the respective network to mark it as an already published event for that network in the IED cache. The IED cache shall support set structures, like Redis or something similar.

   > **Note:** The notified event is not only the body, it is the event with the network parameter that the DLT Adapter receives from the blockchain.

4. , 5. & 6. When a network set is detected to not have one of the received events marked as published then it is published to that network via its respective DLT Adapter prior removal of the network parameter.

7. Now that the event is replicated it is marked as such in the respective set.

8. Subscription to all events is DOME on each configured DLT Adapter.

9. Now Desmos can subscribe, through the IED, to specific events that are of interest, as already done calling the DLT Adapter but through the IED. Now the subscription must be done to every configured DLT Adapter.

10. The IED checks the notifiedEvents set to see if it has been already notified using its global id.

11. If the event has not been notified then it is notified to Desmos. When notifying Desmos only the content from the body of the event, that means that the network parameter is removed.

12. Finally the event is marked as notified by adding its global id to the notifiedEvents set.