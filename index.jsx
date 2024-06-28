import { useEffect, useState } from "react";
import md5 from "md5";

import Button from "portal/atoms/Button";
import Icon from "portal/atoms/Icon";
import Input from "portal/atoms/Input";
import Select from "portal/atoms/Select";
const { default: Modal } = require("portal/organisms/LegacyModal");
import ProgressIndicator from "portal/organisms/ProgressIndicator";
import useAlert from "portal/hooks/useAlert";
import { mbToGb } from "portal/utils/number";
import { extractLastPart } from "portal/utils/object";

import { useGlobalStore } from "portal/store/global";

import { useTrainingPerformStore } from "@store/ml/training/perform/perform";
import { useResourceStore } from "@store/ml/training/inferenceController/resources";

const runningColor = {
  inuse: "inuse", //나 이외 사용하는 용량
  inuseAccount: "inuse-account", //내가 사용하는 용량
  required: "required",
  warning: "warning",
};

const ResourceControlModal = ({ isActive, onClose, usedMaxUsageGpuMemory }) => {
  const { alertComponent, alert } = useAlert({
    disabledBackdrop: true,
  });

  const { setContainerId, setContainerType } = useTrainingPerformStore();
  const { zoneId, accountId } = useGlobalStore();
  const {
    requestResourcesContainers,
    requestResources,
    resourcesContainer,
    resources,
    createInstanceServer,
    deleteResourcesContainers,
  } = useResourceStore();

  const [isPending, setIsPending] = useState(false);
  const [isSetting, setIsSetting] = useState(false);
  const [selectedNode, setSelectedNode] = useState("Dedicated");
  const [stateUsedMaxUsageGpuMemory, setStateUsedMaxUsageGpuMemory] =
    useState(0);
  const [useCommonNode, setUseCommonNode] = useState(true);

  const [spec, setSpec] = useState([]);
  const [libGroup, setLibGroup] = useState([]);
  const [automaticDeletion, setAutomaticDeletion] = useState(true);

  const [selectedSpec, setSelectedSpec] = useState();
  const [selectedLibGroup, setSelectedLibGroup] = useState();
  const [selectedContainerId, setSelectedContainerId] = useState(null);
  const [selectedContainerType, setSelectedContainerType] = useState(null);
  const [myMd5HashId, setMyMd5HashId] = useState(null);

  const [isDeleteConfirm, setIsDeleteConfirm] = useState(null);
  const [isNodeFull, setIsNodeFull] = useState(false);

  const handleOnClose = () => {
    onClose();
  };

  const onClickSave = async () => {
    const params = {
      zoneId,
      accountId,
      type: selectedNode,
      taintId: selectedSpec,
      libGroupId: selectedLibGroup,
      // isRetention: automaticDeletion ? "0" : "1",
      isRetention: "0",
      onPending: setIsPending,
      onError() {
        onClose();
        alert({ title: "Notice", content: "Your request failed." });
      },
    };

    const newResourcesContainer = await reload();

    if (
      newResourcesContainer &&
      newResourcesContainer.limitSize > newResourcesContainer.requestCount
    ) {
      try {
        const { code } = await createInstanceServer(params);
        if (code === 200) {
          await requestResources({ zoneId, accountId });
          setIsSetting(false);
          setSelectedNode("Dedicated");
          requestResourcesContainers();
        }
      } catch (error) {
        alert({ title: "Notice", content: result.message });
      }
    } else {
      setIsNodeFull(true);
    }
  };

  const reload = async () => {
    await requestResources({ zoneId, accountId });
    return requestResourcesContainers();
  };

  const makeRunningBar = (running, totalMemory, property, remainsGpuMemory) => {
    const newRunning = Object.values(
      running.reduce((acc, cur) => {
        const key = cur.md5hashId;
        if (!acc[key]) {
          acc[key] = {
            md5hashId: cur.md5hashId,
            maxUsageGpuMemory: 0,
            memoryUsage: 0,
          };
        }
        acc[key].maxUsageGpuMemory += cur.maxUsageGpuMemory;
        acc[key].memoryUsage += cur.memoryUsage;
        return acc;
      }, {})
    );

    const combinedArray = newRunning.reduce(
      (result, item) => {
        if (item.md5hashId === myMd5HashId) {
          result[1].maxUsageGpuMemory += item.maxUsageGpuMemory;
          result[1].memoryUsage += item.memoryUsage;
          result[1].type = "inuseAccount";
        } else {
          result[0].maxUsageGpuMemory += item.maxUsageGpuMemory;
          result[0].memoryUsage += item.memoryUsage;
          result[0].type = "inuse";
        }
        return result;
      },
      [
        { maxUsageGpuMemory: 0, memoryUsage: 0 },
        { maxUsageGpuMemory: 0, memoryUsage: 0 },
      ]
    );

    const totalMaxUsageGpuMemory = (data) => {
      return data.reduce((total, item) => total + item.maxUsageGpuMemory, 0);
    };

    const requireObject = {
      maxUsageGpuMemory:
        remainsGpuMemory > stateUsedMaxUsageGpuMemory
          ? stateUsedMaxUsageGpuMemory
          : totalMemory - totalMaxUsageGpuMemory(combinedArray),
      memoryUsage: 0,
      type:
        remainsGpuMemory > stateUsedMaxUsageGpuMemory ? "required" : "warning",
    };

    combinedArray.push(requireObject);

    const percent = (totalValue, useValue) => {
      const usagePercent = (useValue / totalValue) * 100;
      return usagePercent + "%";
    };

    return combinedArray.map((info, index) => {
      return (
        <div
          className={`progress-bar ${runningColor[info.type]}`}
          style={{ width: percent(totalMemory, info[property]) }}
        />
      );
    });
  };

  const readyForDeletion = (containerId, e) => {
    e.stopPropagation();
    setIsDeleteConfirm(containerId);
  };

  const _deleteResourcesContainers = async (containerId, e) => {
    e.stopPropagation();
    if (selectedContainerId === containerId) {
      setSelectedContainerId(null);
      setSelectedContainerType(null);
    }

    try {
      const { code } = await deleteResourcesContainers(containerId);
      if (code === 200) {
        await requestResources({ zoneId, accountId });
        requestResourcesContainers();
      }
    } catch (error) {
      alert({ title: "Notice", content: result.message });
    }

    setIsSetting(false);
    setIsDeleteConfirm(null);
  };

  const _setSelectedContainerId = (containerId, resourceType, useSelect) => {
    if (useSelect) {
      setSelectedContainerId(containerId);
      setSelectedContainerType(resourceType);
      setIsDeleteConfirm(null);
    } else {
      return;
    }
  };

  const _useChecked = (remainsGpuMemory, resourceType) => {
    if (stateUsedMaxUsageGpuMemory > 0) {
      return remainsGpuMemory > stateUsedMaxUsageGpuMemory;
    } else {
      if (resourceType === "Dedicated") {
        return (
          remainsGpuMemory > stateUsedMaxUsageGpuMemory &&
          !resources.useDedicated
        );
        //beta 이후는 삭제될 조건
      } else {
        return false;
      }
    }
  };

  const _chekcedDisabled = (
    stateUsedMaxUsageGpuMemory,
    remainsGpuMemory,
    resourceType,
    useDedicated
  ) => {
    return (
      stateUsedMaxUsageGpuMemory > remainsGpuMemory ||
      (stateUsedMaxUsageGpuMemory === 0 && resourceType === "Common") ||
      useDedicated //beta 이후는 삭제될 조건
    );
  };

  const renderNodeArea = () => {
    return resources.map((data) => {
      return (
        <div
          className="col-4"
          onClick={() =>
            _setSelectedContainerId(
              data.containerId,
              data.resourceType,
              _useChecked(data.remainsGpuMemory, data.resourceType)
            )
          }
        >
          <div
            className={`content-box content-box-card min-content-box
                          ${
                            selectedContainerId === data.containerId &&
                            "content-box-card-active"
                          }
                          ${
                            _chekcedDisabled(
                              stateUsedMaxUsageGpuMemory,
                              data.remainsGpuMemory,
                              data.resourceType,
                              data.useDedicated
                            ) && "disabled"
                          } 
                          ${data.resourceType.toLowerCase()}`}
          >
            {data.resourceType === "Dedicated" && !isSetting && (
              <>
                {isDeleteConfirm !== data.containerId ? (
                  <div className="btn-wrap">
                    <Button
                      type="button"
                      className="btn svg-btn btn-circle btn-delete-card"
                      disabled={false}
                      onClick={readyForDeletion.bind(null, data.containerId)}
                    >
                      <Icon
                        width={16}
                        height={16}
                        type="bi-dash-circle-fill"
                        fill="currentColor"
                        fillRule="evenodd"
                        clipRule="evenodd"
                      />
                    </Button>
                  </div>
                ) : (
                  <div className="btn-wrap">
                    <Button
                      type="button"
                      className="btn svg-btn btn-circle btn-delete-card btn-circle-warning"
                      disabled={false}
                      onClick={_deleteResourcesContainers.bind(
                        null,
                        data.containerId
                      )}
                    >
                      <Icon
                        width={16}
                        height={16}
                        type="bi-x-circle-fill"
                        fill="currentColor"
                      />
                    </Button>
                    <div
                      className="tooltip tooltip-fixed show bs-tooltip-auto"
                      data-popper-placement="left"
                    >
                      <div className="tooltip-inner" role="tooltip">
                        Are you sure you want to delete it?
                      </div>
                      <span className="arrow tooltip-arrow"></span>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="content-title-wrap">
              <div className="content-title">
                {extractLastPart(data.containerId)}
              </div>
              <div className="content-subtitle">
                <div className="content-type">{data.resourceType}</div>
              </div>
            </div>

            <div className="content-content-wrap">
              <div className="form-group-wrap">
                <div className="form-group" data-float="vertical">
                  <label className="col-form-label min-label">GPU</label>

                  <div className="col-form-form w-100">
                    <div className="progress-wrap" data-float="vertical">
                      <div
                        className="progress"
                        role="progressbar"
                        aria-label="Basic example"
                        aria-valuenow="50"
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        {makeRunningBar(
                          data.running,
                          data.gpuMemoryTotal,
                          "maxUsageGpuMemory",
                          data.remainsGpuMemory
                        )}
                      </div>

                      <div className="progress-value">
                        <span>{mbToGb(data.gpuMemoryUsage) || 0}GB</span>
                        <span>{mbToGb(data.gpuMemoryTotal) || 0}GB</span>
                        {` is in use`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-group" data-float="vertical">
                  <label className="col-form-label min-label">Memory</label>

                  <div className="col-form-form w-100">
                    <div className="progress-wrap" data-float="vertical">
                      <div
                        className="progress"
                        role="progressbar"
                        aria-label="Basic example"
                        aria-valuenow="50"
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        {makeRunningBar(
                          data.running,
                          data.memoryTotal,
                          "memoryUsage"
                        )}
                      </div>

                      <div className="progress-value">
                        <span>{data.memoryUsage.toFixed(3) || 0}GB</span>
                        <span>{data.memoryTotal.toFixed(3) || 0}GB</span>
                        {` is in use`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-group" data-float="vertical">
                  <label className="col-form-label min-label">Library</label>

                  <div className="col-form-form library">
                    <span>Python 3.9</span>
                    <span>PyTorch 2.X</span>
                  </div>
                </div>

                <div className="form-group" data-float="horizontal">
                  <label className="col-form-label min-label">
                    Estimated minimum end time
                  </label>

                  <div className="col-form-form">
                    {data.estimatedTime || "00:00:00"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  const confirmIsUse = (value) => {
    setAutomaticDeletion(value);
  };

  const _setSelectedNode = (value) => {
    setSelectedNode(value);
    confirmIsUse(true);
  };

  const renderEditArea = () => {
    const nodeTypeOptions = [
      { name: "Dedicated", value: "Dedicated" },
      { name: "Common", value: "Common" },
    ];

    return isSetting ? (
      <div className="col-4">
        <div className="content-box content-box-card min-content-box border-none">
          <div className="content-title-wrap">
            <div className="content-title">New Node</div>
            <div className="content-subtitle">
              <Select
                onChange={(e) => {
                  _setSelectedNode(e.currentTarget.value);
                }}
                // disabled={!useCommonNode}  beta 까지는 Dedicated 서버만 제공
                disabled
              >
                {nodeTypeOptions.map((info) => {
                  return (
                    <option
                      key={info.name}
                      value={info.value}
                      selected={info.value === selectedNode}
                    >
                      {info.name}
                    </option>
                  );
                })}
              </Select>
            </div>
          </div>

          <div className="content-content-wrap">
            <div className="form-group-wrap">
              <div className="form-group" data-float="vertical">
                <label className="col-form-label min-label">
                  Specification
                </label>

                <div className="col-form-form w-100">
                  <Select
                    onChange={(e) => {
                      setSelectedSpec(e.currentTarget.value);
                    }}
                  >
                    {spec.map((info) => {
                      return (
                        <option
                          key={info.name}
                          value={info.value}
                          selected={info.value === selectedSpec.value}
                        >
                          {info.name}
                        </option>
                      );
                    })}
                  </Select>
                </div>
              </div>
              <div className="form-group" data-float="vertical">
                <label className="col-form-label min-label">Library</label>

                <div className="col-form-form w-100">
                  <Select
                    onChange={(e) => {
                      setSelectedLibGroup(e.currentTarget.value);
                    }}
                  >
                    {libGroup.map((info) => {
                      return (
                        <option
                          key={info.name}
                          value={info.value}
                          selected={info.value === selectedLibGroup.value}
                        >
                          {info.name}
                        </option>
                      );
                    })}
                  </Select>
                </div>
              </div>
              <div className="form-group" data-float="horizontal">
                <div className="col-form-form mt-1">
                  <Input
                    id="automaticDeletion"
                    type="checkbox"
                    label="Automatic Deletion"
                    onClick={() => confirmIsUse(!automaticDeletion)}
                    checked={automaticDeletion}
                    // disabled={selectedNode === "Common"}
                    disabled
                  />
                </div>
              </div>
              {isNodeFull && (
                <div className="modal-desc warning-dark">
                  All available nodes have been used
                </div>
              )}
            </div>

            <div className="btn-wrap text-center">
              <Button
                type="button"
                className="btn btn-min point-btn"
                data-style="primary"
                onClick={onClickSave}
              >
                Save
              </Button>
              <Button
                type="button"
                className="btn btn-min point-btn"
                data-style="primary"
                onClick={() => (
                  setIsSetting(false),
                  setSelectedNode("Dedicated"),
                  setIsNodeFull(false)
                )}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="col-4">
        <div className="content-box content-box-card min-content-box">
          <Button
            type="button"
            className="btn btn-full svg-btn"
            title="Add New Node"
            onClick={() => {
              setIsSetting(true), setIsDeleteConfirm(null);
            }}
          >
            <svg
              className="bi bi-plus-circle-fill"
              stroke="none"
              fill="currentColor"
              width="16"
              height="16"
              viewBox="0 0 16 16"
            >
              <path d="M13.6569 13.6569C15.1571 12.1566 16 10.1217 16 8C16 5.87827 15.1571 3.84344 13.6569 2.34315C12.1566 0.842855 10.1217 0 8 0C5.87827 0 3.84344 0.842855 2.34315 2.34315C0.842855 3.84344 0 5.87827 0 8C0 10.1217 0.842855 12.1566 2.34315 13.6569C3.84344 15.1571 5.87827 16 8 16C10.1217 16 12.1566 15.1571 13.6569 13.6569ZM12 8C12 8.55228 11.5523 9 11 9H9V11C9 11.5523 8.55228 12 8 12C7.44772 12 7 11.5523 7 11V9H5C4.44772 9 4 8.55228 4 8C4 7.44771 4.44772 7 5 7H7V5C7 4.44772 7.44772 4 8 4C8.55228 4 9 4.44772 9 5V7H11C11.5523 7 12 7.44772 12 8Z"></path>
            </svg>
          </Button>
        </div>
      </div>
    );
  };

  const separateContainer = (container) => {
    if (container) {
      const spec = container.spec.map((item, index) => {
        return {
          key: index,
          name: `GPU ${item.gpuRamGiB}GB / Memory ${item.ramGiB}GB`,
          value: item.taintId,
        };
      });

      setSpec(spec);
      setSelectedSpec(spec[0].value);

      const libGroup = container.libGroup.map((item) => {
        return {
          name: `${item.pythonVersion} / ${item.frameWorkVersion}`,
          value: item.libGroupId,
        };
      });

      setLibGroup(libGroup);
      setSelectedLibGroup(libGroup[0].value);
    }
  };

  const makeElement = async () => {
    await requestResourcesContainers();
    await requestResources({ zoneId, accountId });
  };

  const generateMD5 = (data) => {
    return md5(data);
  };

  const checkResourceType = (resources, stateUsedMaxUsageGpuMemory) => {
    const hasCommonNode = resources.some((item) => {
      return (
        item.resourceType === "Common" &&
        item.remainsGpuMemory > stateUsedMaxUsageGpuMemory
      );
    });

    return !hasCommonNode;
  };

  const updateUseCommonNode = () => {
    const newUseCommonNode = checkResourceType(
      resources,
      stateUsedMaxUsageGpuMemory
    );
    setUseCommonNode(newUseCommonNode);
  };

  useEffect(() => {
    updateUseCommonNode();
  }, [resources]);

  useEffect(() => {
    isActive &&
      (makeElement(),
      setMyMd5HashId(generateMD5(`${zoneId}${accountId}`)),
      setContainerId(null),
      setContainerType(null));
    return () => {
      setIsSetting(false);
      setSelectedContainerId(null);
      setAutomaticDeletion(true);
      setIsDeleteConfirm(null);
      setIsNodeFull(false);
    };
  }, [isActive]);

  const _setApply = () => {
    setContainerId(selectedContainerId);
    setContainerType(selectedContainerType);
  };

  useEffect(() => {
    resourcesContainer && separateContainer(resourcesContainer);
  }, [resourcesContainer]);

  useEffect(() => {
    setStateUsedMaxUsageGpuMemory(usedMaxUsageGpuMemory || 0);
    // setStateUsedMaxUsageGpuMemory(usedMaxUsageGpuMemory || 1)
  }, [usedMaxUsageGpuMemory]);

  useEffect(() => {
    document.addEventListener("click", () => setIsDeleteConfirm(null));
  }, []);

  return (
    <>
      <Modal
        id="modal_ltr_008"
        cssClass="modal-xl"
        hasTopClose={true}
        isActive={isActive}
        title="Resource Control"
        subtitle={`Estimated Resources Required : GPU ${mbToGb(
          stateUsedMaxUsageGpuMemory
        )}GB`}
        onClose={handleOnClose}
        titleEvent={
          <Button type="button" className="btn point-btn" onClick={reload}>
            <Icon
              type="bi-arrow-repeat"
              width={16}
              height={16}
              fill="currentColor"
              className="bi bi-arrow-repeat"
            />
          </Button>
        }
        isNesting
        buttons={[
          {
            name: "Apply",
            disabled: !selectedContainerId,
            onClick: () => {
              onClose(), _setApply();
            },
          },
        ]}
      >
        <div className="row row-6">
          {renderNodeArea()}
          {/* 여기요 */}
          {resourcesContainer &&
          resourcesContainer.limitSize > resourcesContainer.requestCount
            ? renderEditArea()
            : isNodeFull && renderEditArea()}
        </div>
        {/* {isSetting && */}
        <div className="modal-desc warning-dark fs-875">
          {/* Select nodes may take some time to start working. */}
          {/* 여기요 */}
          {`BETA Version: ${
            resources.length
          } default instances, 1 additional personal resource if available. (${
            resourcesContainer ? resourcesContainer.requestCount : 0
          }/${resourcesContainer ? resourcesContainer.limitSize : 0})`}
          {/* {`BETA Version: ${resources.length} default instances`} */}
        </div>
        {/* } */}

        <ProgressIndicator isActive={isPending} />
      </Modal>
      {alertComponent}
    </>
  );
};

export default ResourceControlModal;
