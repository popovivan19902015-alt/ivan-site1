import { api, sessionId } from "./api.js";
import { phoneKey } from "./catalog.js";

let ordersMemory = [];
let ordersStamp = "";
let clientsMemory = [];

export function getOrders() {
  return ordersMemory.slice();
}

export function loadClients() {
  return uniqueClients(clientsMemory);
}

function rememberOrders(list) {
  ordersMemory = Array.isArray(list) ? list.slice() : [];
  ordersStamp = JSON.stringify(ordersMemory);
}

function rememberClients(list) {
  clientsMemory = Array.isArray(list) ? list.slice() : [];
}

export function uniqueClients(clients) {
  const seen = new Set();
  return clients.filter((client) => {
    const key = phoneKey(client.phone);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function syncClientsFromOrders() {
  return loadClients();
}

export async function refreshOrders() {
  const [orderData, clientData] = await Promise.all([api("/api/orders"), api("/api/clients")]);
  const orders = orderData && Array.isArray(orderData.orders) ? orderData.orders : [];
  const clients = clientData && Array.isArray(clientData.clients) ? clientData.clients : [];
  const stamp = JSON.stringify(orders);
  const same = stamp === ordersStamp && JSON.stringify(clients) === JSON.stringify(clientsMemory);
  rememberOrders(orders);
  rememberClients(clients);
  return !same;
}

export async function addOrder(order) {
  const data = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
  if (Array.isArray(data.orders)) rememberOrders(data.orders);
  else if (data && data.order) rememberOrders([data.order, ...getOrders().filter((entry) => entry.id !== data.order.id)]);
  if (Array.isArray(data.clients)) rememberClients(data.clients);
  return data;
}

export async function updateOrder(id, patch) {
  const data = await api("/api/orders/update", {
    method: "POST",
    body: JSON.stringify({ id, status: patch.status }),
  });
  const list = getOrders();
  const index = list.findIndex((order) => order.id === id);
  if (index >= 0 && data.order) list[index] = data.order;
  rememberOrders(list);
  if (Array.isArray(data.clients)) rememberClients(data.clients);
  return data.order || null;
}

export async function downloadInvoice(id) {
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}/invoice`, {
    cache: "no-store",
    headers: { "X-Shop-Session": sessionId() },
  });
  if (!response.ok) {
    const error = new Error("invoice");
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoice-${String(id).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function removeOrder(id) {
  const data = await api("/api/orders/delete", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  if (Array.isArray(data.orders)) rememberOrders(data.orders);
  else rememberOrders(getOrders().filter((order) => order.id !== id));
  if (Array.isArray(data.clients)) rememberClients(data.clients);
}
