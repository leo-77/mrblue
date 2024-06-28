import { create } from "zustand";

import { isEmpty } from "portal/utils/object";

import { handleHTTP } from "portal/store/handleHTTP";

import {
  getResourcesContainersApi,
  getResourcesApi,
  getResourcesContainerCardsApi,
  createResourcesContainersApi,
  deleteResourcesContainersApi
} from "@api/ml/inferenceController"

export const useResourceStore = create((set, get) => ({
  resourcesContainer: null,
  resources: [],
  resourcesContainerCards: [],

  defaultResource: [],

  async requestResourcesContainers() {
    const data = await handleHTTP(getResourcesContainersApi, {});
    if (data) {
      set({ resourcesContainer: !isEmpty(data) ? { ...data } : null })
      return get().resourcesContainer
    }
  },

  async requestResources(params) {
    const data = await handleHTTP(getResourcesApi, params);
    if (data) {
      data.forEach(element => {
        if (element.running.length === 0) {
          element.running = [
            { "memoryUsage": element.memoryUsage }
          ]
        }
      })

      set({ defaultResource: [...data] })
    }
    get().requestResourcesContainerCards(params)
  },

  async requestResourcesContainerCards(params) {
    try {
      const data = await handleHTTP(getResourcesContainerCardsApi, params);
      if (data) {
        const containers = data.map(container => {
          if (!container.hasOwnProperty('running')) {
            container.running = [];
          }

          if (container.resourceType === "Dedicated" && container.running.length > 0) {
            container.useDedicated = true
          }
          return container;
        })

        set({ resources: get().defaultResource.concat(containers) });

      } else {
        if (defaultResource.length > 0) {
          set({ resources: [...defaultResource] });
        } else {
          set({ resources: get().resources.concat([]) });
        }

      }
    } catch (response) {
      throw response.data.message
    }
  },

  async createInstanceServer(params) {
    try {
      const result = await createResourcesContainersApi(params);
      return result
    } catch ({ response }) {
      throw response.data.message
    }
  },

  async deleteResourcesContainers(containerId) {
    try {
      const result = await deleteResourcesContainersApi(containerId);
      return result
    } catch ({ response }) {
      throw response.data.message
    }
  },

}));