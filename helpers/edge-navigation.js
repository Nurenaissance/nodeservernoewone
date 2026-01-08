/**
 * Edge-based navigation for Flow v2
 * Replaces adjacency list with direct edge queries
 *
 * This module provides utilities for navigating flows using an edge-based approach
 * instead of the legacy adjacency list method. In v2, flows are stored as nodes+edges
 * directly from the frontend, eliminating ID conversion and node expansion.
 */

/**
 * Find next nodes by filtering edges
 *
 * @param {Array} edges - Array of edge objects {source, target, sourceHandle}
 * @param {String} currentNodeId - Current node's string ID
 * @param {String} sourceHandle - Optional: button/list option ID (e.g., "option0", "true", "false")
 * @returns {Array} - Array of next node IDs
 */
export function findNextNodesFromEdges(edges, currentNodeId, sourceHandle = null) {
    if (!edges || edges.length === 0) {
        console.warn("No edges found for navigation");
        return [];
    }

    // Filter edges where source matches current node
    const outgoingEdges = edges.filter(edge => edge.source === currentNodeId);

    if (outgoingEdges.length === 0) {
        console.log(`No outgoing edges from node ${currentNodeId}`);
        return [];
    }

    // If sourceHandle specified (button/list selection), match it
    if (sourceHandle !== null && sourceHandle !== undefined) {
        const matchedEdge = outgoingEdges.find(edge => {
            // Handle different sourceHandle formats
            if (edge.sourceHandle === sourceHandle) return true;
            if (edge.sourceHandle === `option${sourceHandle}`) return true;

            // Condition nodes: true/false
            if (sourceHandle === "Yes" && edge.sourceHandle === "true") return true;
            if (sourceHandle === "No" && edge.sourceHandle === "false") return true;

            return false;
        });

        if (matchedEdge) {
            console.log(`Matched edge: ${currentNodeId} --[${sourceHandle}]--> ${matchedEdge.target}`);
            return [matchedEdge.target];
        } else {
            console.warn(`No edge found for ${currentNodeId} with handle ${sourceHandle}`);
            return [];
        }
    }

    // No sourceHandle: return all targets (for Text/Image/Auto-advance nodes)
    const targets = outgoingEdges.map(edge => edge.target);
    console.log(`Next nodes from ${currentNodeId}: ${targets.join(', ')}`);
    return targets;
}

/**
 * Find node object by string ID
 *
 * @param {Array} nodes - Array of node objects
 * @param {String} nodeId - Node ID to find
 * @returns {Object|null} - Node object or null
 */
export function findNodeById(nodes, nodeId) {
    if (!nodes || !Array.isArray(nodes)) {
        console.warn("Invalid nodes array");
        return null;
    }
    return nodes.find(node => node.id === nodeId) || null;
}

/**
 * Get node data by ID
 * Extracts the 'data' field from node
 *
 * @param {Array} nodes - Array of nodes
 * @param {String} nodeId - Node ID
 * @returns {Object} - Node's data field
 */
export function getNodeData(nodes, nodeId) {
    const node = findNodeById(nodes, nodeId);
    return node?.data || {};
}

/**
 * Map button/list selection back to sourceHandle
 * In v2, buttons are in node.data.options array
 *
 * @param {String} userSelectionID - User's selection (button title or ID)
 * @param {Array} nodes - All nodes
 * @param {Array} edges - All edges
 * @param {String} currentNodeId - Current node ID
 * @returns {String|null} - sourceHandle to use for navigation
 */
export function extractButtonOptionIndex(userSelectionID, nodes, edges, currentNodeId) {
    const currentNode = findNodeById(nodes, currentNodeId);
    if (!currentNode) {
        console.warn(`Current node ${currentNodeId} not found`);
        return null;
    }

    const data = currentNode.data || {};
    const options = data.options || [];

    // Find index of selected option
    const optionIndex = options.findIndex(opt => {
        if (typeof opt === 'string') return opt === userSelectionID;
        if (typeof opt === 'object') return opt.title === userSelectionID || opt.id === userSelectionID;
        return false;
    });

    if (optionIndex !== -1) {
        console.log(`Mapped selection "${userSelectionID}" to option${optionIndex}`);
        return `option${optionIndex}`;
    }

    // Fallback: try direct match with edge sourceHandle
    const outgoingEdges = edges.filter(e => e.source === currentNodeId);
    const matchedEdge = outgoingEdges.find(e => e.sourceHandle === userSelectionID);

    if (matchedEdge) {
        console.log(`Direct match found: ${userSelectionID}`);
        return matchedEdge.sourceHandle;
    }

    console.warn(`Could not map selection "${userSelectionID}" to sourceHandle`);
    return null;
}

/**
 * Get all button/list options for a node
 *
 * @param {Array} nodes - All nodes
 * @param {String} nodeId - Node ID
 * @returns {Array} - Array of option objects {id, title, description}
 */
export function getNodeOptions(nodes, nodeId) {
    const node = findNodeById(nodes, nodeId);
    if (!node || !node.data) return [];

    const options = node.data.options || [];
    return options.map((opt, idx) => {
        if (typeof opt === 'string') {
            return { id: `option${idx}`, title: opt };
        }
        return {
            id: opt.id || `option${idx}`,
            title: opt.title || opt,
            description: opt.description || ''
        };
    });
}

/**
 * Check if a node is a terminal node (no outgoing edges)
 *
 * @param {Array} edges - All edges
 * @param {String} nodeId - Node ID to check
 * @returns {Boolean} - True if terminal node
 */
export function isTerminalNode(edges, nodeId) {
    return !edges.some(edge => edge.source === nodeId);
}

/**
 * Get all incoming nodes for a given node
 *
 * @param {Array} edges - All edges
 * @param {String} nodeId - Node ID
 * @returns {Array} - Array of source node IDs
 */
export function findIncomingNodes(edges, nodeId) {
    return edges
        .filter(edge => edge.target === nodeId)
        .map(edge => edge.source);
}
